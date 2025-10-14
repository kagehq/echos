import { createApp, eventHandler, readBody, toNodeListener, setResponseHeader } from "h3";
import { listen } from "listhen";
import { WebSocketServer } from "ws";
import { createSecretKey, randomBytes, createHash } from "node:crypto";
import * as jose from "jose";
import { 
  initTemplatesWatcher, 
  listTemplates, 
  applyRole, 
  getResolvedPolicyRegex,
  getRoleAssignment,
  listRoleAssignments,
  type ResolvedPolicy
} from "./policies.js";

type Decision = "allow"|"block"|"ask";
type PolicyMatch = { status: Decision; rule?: string; source?: string; byToken?: boolean };
type TokenRecord = { token:string; agent:string; scopes:string[]; expiresAt:number; status:"active"|"paused"|"revoked" };
type EventMsg = { id:string; ts:number; agent:string; intent:string; target?:string; meta?:any; preview?:string; tokenAttached?:boolean; request?:any; response?:any; metadata?:any; policy?: PolicyMatch };
type TimelineEntry = EventMsg | { type: string; ts: number; action?: string; token?: string; [key: string]: any };

const app = createApp();
const wss = new WebSocketServer({ noServer:true });
const clients = new Set<any>();
const PENDING = new Map<string,(d:any)=>void>();
const TOKENS = new Map<string, TokenRecord>();
const TIMELINE: TimelineEntry[] = [];

const SECRET_KEY = createSecretKey(process.env.ECHOS_SECRET ? Buffer.from(process.env.ECHOS_SECRET,"utf8") : randomBytes(32));
const now = ()=>Date.now();
const broadcast = (msg:any)=>{ const s=JSON.stringify(msg); for(const c of clients){ try{ c.send(s);}catch{} } };
const safeHash = (token:string)=>"sha256:"+createHash("sha256").update(token).digest("hex");

// Initialize template watcher (file-based policies with hot-reload)
await initTemplatesWatcher();

// Official scope taxonomy
const SCOPES = {
  "llm.chat": "Chat with LLM services",
  "email.send": "Send emails",
  "email.read": "Read emails",
  "calendar.read": "Read calendar events",
  "calendar.write": "Create/modify calendar events",
  "slack.post": "Post to Slack channels",
  "slack.read": "Read Slack messages",
  "fs.read": "Read files",
  "fs.write": "Write files",
  "fs.delete": "Delete files",
  "http.request": "Make HTTP requests",
} as const;

// Regex policies with proper anchoring
// Note: No $ anchor because we want to match "intent:target" where target can be anything
// The ^ anchor ensures we match from the start, preventing accidental substring matches
const POLICY = {
  allow: [/^llm\.chat:/],     // Allow LLM chat with any target
  ask:   [
    /^slack\.post:/, 
    /^calendar\.read:/, 
    /^calendar\.write:/, 
    /^email\.send:/
  ],
  block: [/^fs\.delete:/]     // Block file deletion with any target
};
// Timeout protection for regex evaluation (prevents ReDoS attacks)
const REGEX_TIMEOUT_MS = 100; // 100ms max for regex evaluation

const match = (arr:RegExp[], s:string)=>arr.some(r=>r.test(s));

const findMatch = (arr:RegExp[], s:string):string|null => {
  const startTime = Date.now();
  
  for(const r of arr) {
    // Check if we've exceeded timeout (ReDoS protection)
    if (Date.now() - startTime > REGEX_TIMEOUT_MS) {
      console.error(`[SECURITY] Regex evaluation timeout after ${REGEX_TIMEOUT_MS}ms - possible ReDoS attack`);
      throw new Error('Regex evaluation timeout');
    }
    
    if (r.test(s)) return r.source;
  }
  return null;
};

// ENV config (read early for CORS)
const CORS_ORIGIN = process.env.ECHOS_CORS_ORIGIN || "*";

// CORS middleware
app.use(eventHandler((req) => {
  setResponseHeader(req, "Access-Control-Allow-Origin", CORS_ORIGIN);
  setResponseHeader(req, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  setResponseHeader(req, "Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    return { ok: true } as any;
  }
}));

// --- Decide: allow|block|ask ---
app.use(eventHandler(async (req) => {
  if (req.path !== '/decide' || req.method !== 'POST') return;
  
  const body = await readBody<EventMsg & { token?: string }>(req);
  const { token, ...e } = body;
  
  let policyMatch: PolicyMatch;
  
  // Check if a valid token exists that covers this intent
  if (token) {
    const tokenRec = TOKENS.get(token);
    if (tokenRec && tokenRec.status === "active" && now() < tokenRec.expiresAt) {
      // Check if token scopes cover this intent
      if (tokenRec.scopes.includes(e.intent)) {
        policyMatch = { status: "allow", byToken: true };
        return { status: "allow" as Decision, id: e.id, policy: policyMatch };
      }
    }
  }
  
  // Otherwise, apply policy rules (check role-based policy first, then fallback to base POLICY)
  const sig = `${e.intent}:${e.target ?? ""}`;
  let status:Decision = "block"; // SECURE DEFAULT: block if no policy matches or evaluation fails
  let matchedRule: string | null = null;
  let source: string | undefined = undefined;
  
  try {
    // Check if agent has a role-applied policy
    const rolePol = getResolvedPolicyRegex(e.agent);
    const policyToUse = rolePol || POLICY;
    const policySource = rolePol ? "role" : "base";
    
    // Evaluate policies with ReDoS protection
    if ((matchedRule = findMatch(policyToUse.block, sig))) {
      status = "block";
      source = `${policySource}_block`;
    } else if ((matchedRule = findMatch(policyToUse.ask, sig))) {
      status = "ask";
      source = `${policySource}_ask`;
    } else if ((matchedRule = findMatch(policyToUse.allow, sig))) {
      status = "allow";
      source = `${policySource}_allow`;
    }
  } catch (err) {
    // If regex evaluation fails/times out, default to BLOCK for security
    console.error(`[SECURITY] Policy evaluation failed for ${sig}:`, err);
    status = "block";
    source = "evaluation_failed";
  }
  
  policyMatch = { 
    status, 
    rule: matchedRule || undefined, 
    source,
    byToken: false 
  };
  
  if (status === "ask") {
    const msg = { type:"ask", event:{ ...e, policy: policyMatch }, ts: now() };
    TIMELINE.unshift(msg);
    await broadcast(msg);
  }
  return { status, id: e.id, policy: policyMatch };
}));

// Long-poll wait for human decision (from dashboard)
app.use(eventHandler(async (req) => {
  const match = req.path?.match(/^\/await\/(.+)$/);
  if (!match) return;
  
  const id = match[1];
  const result = await new Promise((resolve)=>{ PENDING.set(id, resolve); setTimeout(()=>{ if(PENDING.has(id)){ PENDING.delete(id); resolve({ status:"block" }); } }, 120000); });
  return result;
}));

// Human decision → optional token issuance via grant
app.use(eventHandler(async (req)=>{
  const match = req.path?.match(/^\/decide\/(.+)$/);
  if (!match) return;
  
  const id = match[1];
  const body = await readBody<{ status:"allow"|"block"; agent?:string; grant?:{ scopes:string[]; durationSec:number; reason?:string } }>(req);
  let payload:any = { status: body.status };
  if (body.status==="allow" && body.grant?.scopes?.length && body.grant.durationSec>0){
    const agent = body.agent ?? "default";
    const expAt = now() + body.grant.durationSec*1000;
    const jwt = await new jose.SignJWT({ agent, scopes: body.grant.scopes, exp: Math.floor(expAt/1000) })
      .setProtectedHeader({ alg:"HS256" })
      .sign(SECRET_KEY);
    const rec: TokenRecord = { token: jwt, agent, scopes: body.grant.scopes, expiresAt: expAt, status:"active" };
    TOKENS.set(jwt, rec);
    payload = { status:"allow", token: rec };
  }
  
  // Find the original ask event to include policy information
  const originalAsk = TIMELINE.find((e: any) => e.type === "ask" && e.event?.id === id) as any;
  const policy = originalAsk?.event?.policy;
  
  const fn = PENDING.get(id); if (fn){ fn(payload); PENDING.delete(id); }
  const msg = { type:"decision", id, payload, policy, ts: now() };
  TIMELINE.unshift(msg);
  await broadcast(msg);
  return { ok:true };
}));

// Tokens lifecycle
app.use("/tokens/issue", eventHandler(async (req)=>{
  const b = await readBody<{agent:string; scopes:string[]; durationSec:number; reason?:string}>(req);
  const expAt = now() + Math.max(60, b.durationSec||0)*1000;
  const jwt = await new jose.SignJWT({ agent: b.agent, scopes: b.scopes, exp: Math.floor(expAt/1000) }).setProtectedHeader({ alg:"HS256" }).sign(SECRET_KEY);
  const rec: TokenRecord = { token: jwt, agent: b.agent, scopes: b.scopes, expiresAt: expAt, status:"active" };
  TOKENS.set(jwt, rec);
  const msg = { type:"token", action:"issued", token: jwt, ts: now() };
  TIMELINE.unshift(msg);
  await broadcast(msg);
  return { token: rec };
}));
app.use("/tokens/revoke", eventHandler(async (req)=>{ const { token } = await readBody<{token:string}>(req); const t=TOKENS.get(token); if(t){ t.status="revoked"; TOKENS.set(token,t); const msg = { type:"token", action:"revoked", token, ts: now() }; TIMELINE.unshift(msg); await broadcast(msg); } return { ok:true }; }));
app.use("/tokens/pause",  eventHandler(async (req)=>{ const { token } = await readBody<{token:string}>(req); const t=TOKENS.get(token); if(t){ t.status="paused";  TOKENS.set(token,t); const msg = { type:"token", action:"paused", token, ts: now() }; TIMELINE.unshift(msg); await broadcast(msg);  } return { ok:true }; }));
app.use("/tokens/resume", eventHandler(async (req)=>{ const { token } = await readBody<{token:string}>(req); const t=TOKENS.get(token); if(t){ t.status="active";  TOKENS.set(token,t); const msg = { type:"token", action:"active", token, ts: now() }; TIMELINE.unshift(msg); await broadcast(msg); } return { ok:true }; }));
app.use("/tokens/list", eventHandler(async ()=>({ tokens: Array.from(TOKENS.values()) })));

// Token introspection (validate + get details)
app.use("/tokens/introspect", eventHandler(async (req)=>{
  const { token } = await readBody<{token:string}>(req);
  const rec = TOKENS.get(token);
  if (!rec) return { active: false, status: "revoked" };
  const expired = now() >= rec.expiresAt;
  const active = rec.status === "active" && !expired;
  return { 
    active, 
    status: rec.status, 
    agent: rec.agent, 
    scopes: rec.scopes, 
    expiresAt: rec.expiresAt,
    tokenHash: safeHash(token)
  };
}));

// List available scopes
app.use("/scopes", eventHandler(async ()=>({ scopes: SCOPES })));

// --- Templates & Roles APIs ---
// List all available templates
app.use("/templates", eventHandler(async ()=>({ templates: listTemplates() })));

// Apply a role to an agent (with optional overrides)
app.use("/roles/apply", eventHandler(async (req)=>{
  const body = await readBody<{ 
    agentId: string; 
    template: string; 
    overrides?: { allow?: string[]; ask?: string[]; block?: string[] } 
  }>(req);
  
  try {
    const resolved = applyRole(body.agentId, body.template, body.overrides as any);
    
    // Audit log: record role change
    const msg = { 
      type: "roleApplied", 
      agent: body.agentId, 
      template: body.template,
      policy: resolved,
      overrides: body.overrides,
      ts: now() 
    };
    TIMELINE.unshift(msg);
    await broadcast(msg);
    
    return { ok: true, policy: resolved };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}));

// Get resolved policy for a specific agent
app.use(eventHandler(async (req)=>{
  const match = req.path?.match(/^\/roles\/(.+)$/);
  if (!match || req.method !== 'GET') return;
  
  const agentId = decodeURIComponent(match[1]);
  const assignment = getRoleAssignment(agentId);
  
  if (!assignment) {
    return { agentId, allow: [], ask: [], block: [], template: null };
  }
  
  return { 
    agentId, 
    template: assignment.template,
    appliedAt: assignment.appliedAt,
    allow: assignment.policy.allow, 
    ask: assignment.policy.ask, 
    block: assignment.policy.block 
  };
}));

// List all role assignments
app.use("/roles", eventHandler(async (req)=>{
  if (req.method !== 'GET') return;
  return { roles: listRoleAssignments() };
}));

// Events & timeline
app.use("/events", eventHandler(async (req)=>{ 
  if (req.method !== 'POST') return;
  const e = await readBody<EventMsg>(req); 
  const msg = { type:"event", event:e, ts: e.ts };
  TIMELINE.unshift(msg); 
  await broadcast(msg); 
  return { ok:true };
}));

// Audit export (NDJSON format for enterprise) - must come BEFORE /timeline
app.use("/timeline.ndjson", eventHandler((req)=>{
  const ndjson = TIMELINE.map(e => JSON.stringify(e)).join('\n');
  setResponseHeader(req, "Content-Type", "application/x-ndjson");
  setResponseHeader(req, "Content-Disposition", `attachment; filename="echos-timeline-${now()}.ndjson"`);
  return ndjson + '\n';
}));

app.use("/timeline", eventHandler(async (req)=>{
  // Avoid matching .ndjson (already handled above)
  if (req.path?.includes('.ndjson')) return;
  return { events: TIMELINE.slice(0,1000) };
}));
app.use("/timeline/replay", eventHandler(async (req)=>{ const { fromTs, toTs } = await readBody<{fromTs?:number; toTs?:number}>(req); const s=fromTs??0, t=toTs??now(); const slice = TIMELINE.filter(e=>e.ts>=s && e.ts<=t).sort((a,b)=>a.ts-b.ts); return { events:slice }; }));

// ENV config (continued)
const PORT = parseInt(process.env.ECHOS_PORT || "3434");
const HOST = process.env.ECHOS_HOST || "127.0.0.1";
const LOCAL_ONLY = process.env.ECHOS_LOCAL_ONLY === "1";

// Boot HTTP + WS
const server = toNodeListener(app);
const http = await listen(server, { port: PORT, hostname: HOST, name:"echosd" });
http.server.on("upgrade", (req, socket, head)=> {
  if (req.url==="/ws") wss.handleUpgrade(req, socket, head, (ws)=>{ clients.add(ws); ws.on("close",()=>clients.delete(ws)); });
  else socket.destroy();
});
console.log(`🟢 echosd @ http://${HOST}:${PORT}${LOCAL_ONLY ? ' (local-only)' : ''}`);
