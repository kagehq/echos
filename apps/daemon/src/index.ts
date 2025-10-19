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
  type ResolvedPolicy,
  type PolicyLimits
} from "./policies.js";
import { filterInput, INPUT_FILTER_POLICIES, InputFilterResult } from './input-filters.js';
import { supabase } from './supabase.js';
import { authenticateRequest, requireAuth, type AuthContext } from './auth.js';
import { 
  storeEvent, 
  getEvents, 
  getOrCreateAgent, 
  updateAgentPolicy, 
  getAgent, 
  listAgents,
  // Templates
  getTemplate,
  listTemplates as listDbTemplates,
  createTemplate,
  // Tokens
  storeToken,
  getToken as getDbToken,
  updateTokenStatus,
  listTokens as listDbTokens,
  // Webhooks
  getWebhooks as getDbWebhooks,
  addWebhook as addDbWebhook,
  removeWebhook as removeDbWebhook,
  // Spend tracking
  addSpend as addDbSpend,
  getSpendSummary,
  getAllSpend
} from './db.js';

type Decision = "allow"|"block"|"ask";
type SpendLimitInfo = { timeframe: "daily" | "monthly"; category: "llm" | "total"; value: number; spent: number; remaining: number };
type PolicyMatch = { status: Decision; rule?: string; source?: string; byToken?: boolean; limit?: SpendLimitInfo };
type TokenRecord = { 
  token:string; 
  agent:string; 
  scopes:string[]; 
  expiresAt:number; 
  status:"active"|"paused"|"revoked";
  createdBy?: string;
  createdReason?: string;
  customerId?: string;
  subscriptionId?: string;
};

type EventMsg = { 
  id:string; 
  ts:number; 
  agent:string; 
  intent:string; 
  target?:string; 
  meta?:any; 
  preview?:string; 
  tokenAttached?:boolean; 
  request?:any; 
  response?:any; 
  metadata?:any; 
  policy?: PolicyMatch; 
  costUsd?: number;
  // Enhanced business context
  customerId?: string;
  subscriptionId?: string;
  feature?: string;
  environment?: string;
  // Enhanced audit trail
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  correlationId?: string;
  // Performance metrics
  duration?: number;
  tokensUsed?: number;
  modelVersion?: string;
  latency?: number;
  // Error context
  errorCode?: string;
  errorStack?: string;
  retryCount?: number;
  errorContext?: any;
};
type TimelineEntry = EventMsg | { type: string; ts: number; action?: string; token?: string; [key: string]: any };

const app = createApp();
const wss = new WebSocketServer({ noServer:true });
const clients = new Set<any>();
const PENDING = new Map<string,(d:any)=>void>();
const TOKENS = new Map<string, TokenRecord>();
const TIMELINE: TimelineEntry[] = [];
const WEBHOOKS: string[] = []; // URLs to notify on events
const DEBUG_MODE = process.env.ECHOS_DEBUG === "1";
const DB_MODE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

if (DB_MODE) {
  console.log('[Database] ✓ Database mode enabled - using Supabase for agents and events');
} else {
  console.log('[Database] ℹ Legacy mode - using YAML files and memory storage');
}

const SECRET_KEY = createSecretKey(process.env.ECHOS_SECRET ? Buffer.from(process.env.ECHOS_SECRET,"utf8") : randomBytes(32));
const now = ()=>Date.now();
const broadcast = (msg:any)=>{ const s=JSON.stringify(msg); for(const c of clients){ try{ c.send(s);}catch{} } };
const safeHash = (token:string)=>"sha256:"+createHash("sha256").update(token).digest("hex");

type SpendTracker = {
  dayKey: string;
  monthKey: string;
  daily: { llm: number; total: number };
  monthly: { llm: number; total: number };
};
type SpendSnapshot = {
  daily: { llmUsd: number; totalUsd: number };
  monthly: { llmUsd: number; totalUsd: number };
};
const SPEND = new Map<string, SpendTracker>();

const getDayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const getMonthKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function ensureTracker(agent: string, ts: number): SpendTracker {
  const dayKey = getDayKey(ts);
  const monthKey = getMonthKey(ts);
  const tracker =
    SPEND.get(agent) ??
    {
      dayKey,
      monthKey,
      daily: { llm: 0, total: 0 },
      monthly: { llm: 0, total: 0 }
    };

  if (tracker.dayKey !== dayKey) {
    tracker.dayKey = dayKey;
    tracker.daily.llm = 0;
    tracker.daily.total = 0;
  }
  if (tracker.monthKey !== monthKey) {
    tracker.monthKey = monthKey;
    tracker.monthly.llm = 0;
    tracker.monthly.total = 0;
  }

  SPEND.set(agent, tracker);
  return tracker;
}

function addSpend(agent: string, amount: number, ts: number, category: "llm" | "general") {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const tracker = ensureTracker(agent, ts);
  tracker.daily.total += amount;
  tracker.monthly.total += amount;
  if (category === "llm") {
    tracker.daily.llm += amount;
    tracker.monthly.llm += amount;
  }
}

function getSpend(agent: string, ts: number = now()): SpendSnapshot {
  if (!SPEND.has(agent)) {
    const tracker = ensureTracker(agent, ts);
    return {
      daily: { llmUsd: tracker.daily.llm, totalUsd: tracker.daily.total },
      monthly: { llmUsd: tracker.monthly.llm, totalUsd: tracker.monthly.total }
    };
  }
  const tracker = ensureTracker(agent, ts);
  return {
    daily: { llmUsd: tracker.daily.llm, totalUsd: tracker.daily.total },
    monthly: { llmUsd: tracker.monthly.llm, totalUsd: tracker.monthly.total }
  };
}

function extractCostUsd(event: EventMsg): number | null {
  const candidates = [
    event.costUsd,
    event.metadata?.costUsd,
    event.metadata?.cost_usd,
    event.metadata?.cost?.usd,
    event.meta?.costUsd,
    event.meta?.cost_usd,
    event.meta?.cost?.usd
  ];
  for (const val of candidates) {
    if (typeof val === "number" && Number.isFinite(val)) {
      return val;
    }
  }
  return null;
}

// Debug logging helper
const debug = (...args: any[]) => {
  if (DEBUG_MODE) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
};

// Webhook notification helper
async function notifyWebhooks(event: any) {
  if (!WEBHOOKS.length) return;
  
  for (const url of WEBHOOKS) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).catch(err => {
        console.error(`[webhook] Failed to notify ${url}:`, err.message);
      });
      debug('Webhook notified:', url);
    } catch (e) {
      console.error(`[webhook] Error notifying ${url}:`, e);
    }
  }
}

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
  setResponseHeader(req, "Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
  setResponseHeader(req, "Access-Control-Allow-Headers", "content-type,authorization,x-api-key");
  if (req.method === "OPTIONS") {
    return { ok: true } as any;
  }
}));

// Enhanced error context helper
function buildErrorContext(e: EventMsg, status: Decision, matchedRule?: string, source?: string, policyMatch?: PolicyMatch): string {
  const parts = [];
  
  if (status === 'block') {
    parts.push(`Action blocked by policy`);
    if (matchedRule) parts.push(`Matched rule: "${matchedRule}"`);
    if (source) parts.push(`Source: ${source}`);
    parts.push(`Agent "${e.agent}" attempted: ${e.intent}${e.target ? ` → ${e.target}` : ''}`);

    if (policyMatch?.limit) {
      const { timeframe, category, value, spent, remaining } = policyMatch.limit;
      const timeframeLabel = timeframe === "daily" ? "daily" : "monthly";
      const categoryLabel = category === "llm" ? "LLM" : "AI";
      const formattedSpent = spent.toFixed(2);
      const formattedLimit = value.toFixed(2);
      const formattedRemaining = Math.max(0, remaining).toFixed(2);
      parts.push(`${categoryLabel} ${timeframeLabel} spend ${spent >= value ? "limit reached" : "limit threshold"}`);
      parts.push(`Spent $${formattedSpent} of $${formattedLimit} (remaining $${formattedRemaining})`);
    }
  } else if (status === 'ask') {
    parts.push(`User approval required`);
    if (matchedRule) parts.push(`Matched rule: "${matchedRule}"`);
    parts.push(`Agent "${e.agent}" requesting: ${e.intent}${e.target ? ` → ${e.target}` : ''}`);
  }
  
  return parts.join('. ');
}

// --- Decide: allow|block|ask ---
app.use(eventHandler(async (req) => {
  if (req.path !== '/decide' || req.method !== 'POST') return;
  
  const decisionStartTime = Date.now(); // Track decision processing time
  
  const body = await readBody<EventMsg & { token?: string }>(req);
  const { token, ...e } = body;
  
  debug('Decision request:', { agent: e.agent, intent: e.intent, target: e.target, hasToken: !!token });
  
  // Apply input filtering for content that might contain sensitive data
  let inputFilterResult: InputFilterResult | null = null;
  if (e.target && typeof e.target === 'string' && e.target.length > 0) {
    // Use strict policy for sensitive intents, balanced for others
    const filterPolicy = ['llm.chat', 'email.send', 'slack.post'].includes(e.intent) 
      ? INPUT_FILTER_POLICIES.strict 
      : INPUT_FILTER_POLICIES.balanced;
    
    inputFilterResult = filterInput(e.target, filterPolicy);
    
    if (!inputFilterResult.allowed) {
      debug('Input blocked by filter:', { 
        agent: e.agent, 
        intent: e.intent, 
        warnings: inputFilterResult.warnings,
        classifications: inputFilterResult.classifications 
      });
      return { 
        status: "block" as Decision, 
        id: e.id, 
        policy: { status: "block", source: "input_filter" },
        message: `Input blocked: ${inputFilterResult.warnings.join(', ')}`
      };
    }
    
    // If content was sanitized, update the target
    if (inputFilterResult.sanitized !== e.target) {
      e.target = inputFilterResult.sanitized;
      debug('Input sanitized:', { 
        agent: e.agent, 
        redactions: inputFilterResult.redactions.length,
        classifications: inputFilterResult.classifications 
      });
    }
  }
  
  let policyMatch: PolicyMatch;
  
  // Check if a valid token exists that covers this intent
  if (token) {
    let tokenRec = TOKENS.get(token); // Check memory first (backward compat)
    
    // If not in memory and DB_MODE, check database
    if (!tokenRec && DB_MODE) {
      const auth = await authenticateRequest(req);
      if (auth) {
        const dbToken = await getDbToken(token, auth.organizationId);
        if (dbToken) {
          tokenRec = {
            token: dbToken.token,
            agent: dbToken.agent_id,
            scopes: dbToken.scopes,
            expiresAt: new Date(dbToken.expires_at).getTime(),
            status: dbToken.status as "active" | "paused" | "revoked"
          };
        }
      }
    }
    
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
  let limitInfo: SpendLimitInfo | undefined;
  const roleAssignment = getRoleAssignment(e.agent);
  const rolePol = getResolvedPolicyRegex(e.agent);
  const policyToUse = rolePol || POLICY;
  const policySource = rolePol ? "role" : "base";
  
  try {
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
  
  // Enforce spend limits if defined in the policy
  if (status !== "block") {
    const limits: PolicyLimits | undefined = roleAssignment?.policy?.limits;
    if (limits) {
      const spend = getSpend(e.agent);
      const pendingCost = extractCostUsd(e) ?? 0;

      if (e.intent === "llm.chat") {
        if (typeof limits.llm_daily_usd === "number" && Number.isFinite(limits.llm_daily_usd)) {
          const projected = spend.daily.llmUsd + pendingCost;
          const remaining = Math.max(0, limits.llm_daily_usd - projected);
          if (projected >= limits.llm_daily_usd) {
            limitInfo = {
              timeframe: "daily",
              category: "llm",
              value: limits.llm_daily_usd,
              spent: projected,
              remaining
            };
          }
        }
        if (!limitInfo && typeof limits.llm_monthly_usd === "number" && Number.isFinite(limits.llm_monthly_usd)) {
          const projected = spend.monthly.llmUsd + pendingCost;
          const remaining = Math.max(0, limits.llm_monthly_usd - projected);
          if (projected >= limits.llm_monthly_usd) {
            limitInfo = {
              timeframe: "monthly",
              category: "llm",
              value: limits.llm_monthly_usd,
              spent: projected,
              remaining
            };
          }
        }
      }

      if (!limitInfo && typeof limits.ai_daily_usd === "number" && Number.isFinite(limits.ai_daily_usd)) {
        const projected = spend.daily.totalUsd + pendingCost;
        const remaining = Math.max(0, limits.ai_daily_usd - projected);
        if (projected >= limits.ai_daily_usd) {
          limitInfo = {
            timeframe: "daily",
            category: "total",
            value: limits.ai_daily_usd,
            spent: projected,
            remaining
          };
        }
      }

      if (!limitInfo && typeof limits.ai_monthly_usd === "number" && Number.isFinite(limits.ai_monthly_usd)) {
        const projected = spend.monthly.totalUsd + pendingCost;
        const remaining = Math.max(0, limits.ai_monthly_usd - projected);
        if (projected >= limits.ai_monthly_usd) {
          limitInfo = {
            timeframe: "monthly",
            category: "total",
            value: limits.ai_monthly_usd,
            spent: projected,
            remaining
          };
        }
      }
    }
  }

  if (limitInfo) {
    status = "block";
    matchedRule = `limit:${limitInfo.category === "llm" ? "llm" : "ai"}_${limitInfo.timeframe}`;
    source = "limits";
  }

  policyMatch = { 
    status, 
    rule: matchedRule || undefined, 
    source,
    byToken: false,
    limit: limitInfo
  };
  
  // Build error context for better messages
  const errorContext = buildErrorContext(e, status, matchedRule || undefined, source, policyMatch);
  
  // Calculate processing duration
  const duration = Date.now() - decisionStartTime;
  
  debug('Policy decision:', { status, rule: matchedRule, source, limit: limitInfo, context: errorContext, duration });
  
  if (status === "ask") {
    const msg = { type:"ask", event:{ ...e, policy: policyMatch, duration }, ts: now() };
    TIMELINE.unshift(msg);
    await broadcast(msg);
    await notifyWebhooks(msg);
  }
  
  return { status, id: e.id, policy: policyMatch, message: errorContext, duration };
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
  await notifyWebhooks(msg);
  debug('Human decision:', { id, status: body.status, hasToken: !!payload.token });
  return { ok:true };
}));

// Tokens lifecycle
app.use("/tokens/issue", eventHandler(async (req)=>{
  const b = await readBody<{
    agent:string; 
    scopes:string[]; 
    durationSec:number; 
    reason?:string;
    createdBy?: string;
    createdReason?: string;
    customerId?: string;
    subscriptionId?: string;
  }>(req);
  
  const expAt = now() + Math.max(60, b.durationSec||0)*1000;
  const jwt = await new jose.SignJWT({ agent: b.agent, scopes: b.scopes, exp: Math.floor(expAt/1000) }).setProtectedHeader({ alg:"HS256" }).sign(SECRET_KEY);
  
  const rec: TokenRecord = { 
    token: jwt, 
    agent: b.agent, 
    scopes: b.scopes, 
    expiresAt: expAt, 
    status:"active",
    createdBy: b.createdBy,
    createdReason: b.createdReason || b.reason,
    customerId: b.customerId,
    subscriptionId: b.subscriptionId
  };
  
  // Store in database if in DB mode
  if (DB_MODE) {
    const auth = await authenticateRequest(req);
    if (auth) {
      await storeToken(jwt, auth.organizationId, b.agent, b.scopes, new Date(expAt), {
        createdBy: b.createdBy,
        createdReason: b.createdReason || b.reason,
        customerId: b.customerId,
        subscriptionId: b.subscriptionId
      });
    }
  }
  
  // Also store in memory for backward compatibility
  TOKENS.set(jwt, rec);
  const msg = { 
    type:"token", 
    action:"issued", 
    token: jwt, 
    ts: now(),
    createdBy: b.createdBy,
    createdReason: b.createdReason || b.reason,
    customerId: b.customerId,
    subscriptionId: b.subscriptionId
  };
  TIMELINE.unshift(msg);
  await broadcast(msg);
  await notifyWebhooks(msg);
  debug('Token issued:', { 
    agent: b.agent, 
    scopes: b.scopes, 
    durationSec: b.durationSec,
    createdBy: b.createdBy,
    customerId: b.customerId
  });
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

// --- Policy Testing/Dry-Run ---
app.use("/policy/test", eventHandler(async (req) => {
  if (req.method !== 'POST') return;
  
  const body = await readBody<{ 
    agent: string; 
    intent: string; 
    target?: string;
    policy?: { allow?: string[]; ask?: string[]; block?: string[] };
  }>(req);
  
  debug('Policy test:', body);
  
  const sig = `${body.intent}:${body.target ?? ""}`;
  let status: Decision = "block";
  let matchedRule: string | null = null;
  let source: string | undefined = undefined;
  
  try {
    // Use provided policy or agent's role policy or base policy
    let policyToUse = POLICY;
    let policySource = "base";
    
    if (body.policy) {
      // Test with provided policy (dry-run mode)
      const testPolicy = {
        allow: (body.policy.allow || []).map(p => new RegExp("^" + p.replace(/\*/g, ".*") + "$")),
        ask: (body.policy.ask || []).map(p => new RegExp("^" + p.replace(/\*/g, ".*") + "$")),
        block: (body.policy.block || []).map(p => new RegExp("^" + p.replace(/\*/g, ".*") + "$"))
      };
      policyToUse = testPolicy;
      policySource = "test";
    } else {
      // Check if agent has a role-applied policy
      const rolePol = getResolvedPolicyRegex(body.agent);
      if (rolePol) {
        policyToUse = rolePol;
        policySource = "role";
      }
    }
    
    // Evaluate policies
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
    status = "block";
    source = "evaluation_failed";
    return { 
      ok: false, 
      error: err instanceof Error ? err.message : String(err),
      status, 
      signature: sig 
    };
  }
  
  const message = buildErrorContext(
    { id: 'test', agent: body.agent, intent: body.intent, target: body.target, ts: now() }, 
    status, 
    matchedRule || undefined, 
    source,
    undefined
  );
  
  return { 
    ok: true, 
    status, 
    rule: matchedRule, 
    source,
    signature: sig,
    message 
  };
}));

// --- Input Filter Testing ---
app.use("/input-filter/test", eventHandler(async (req) => {
  if (req.method !== 'POST') return;
  
  const body = await readBody<{ 
    content: string;
    policy?: 'strict' | 'balanced' | 'permissive';
  }>(req);
  
  debug('Input filter test:', { content: body.content.substring(0, 100), policy: body.policy });
  
  try {
    const policy = body.policy ? INPUT_FILTER_POLICIES[body.policy] : INPUT_FILTER_POLICIES.balanced;
    const result = filterInput(body.content, policy);
    
    return {
      ok: true,
      allowed: result.allowed,
      sanitized: result.sanitized,
      warnings: result.warnings,
      classifications: result.classifications,
      redactions: result.redactions,
      policy: body.policy || 'balanced'
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}));

// --- Template Validation ---
app.use("/templates/validate", eventHandler(async (req) => {
  if (req.method !== 'POST') return;
  
  const body = await readBody<{ yaml: string }>(req);
  
  debug('Template validation:', body.yaml.substring(0, 100));
  
  try {
    const YAML = await import("yaml");
    const parsed = YAML.parse(body.yaml);
    
    // Validate structure
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!parsed || typeof parsed !== 'object') {
      errors.push("Invalid YAML: expected an object");
    } else {
      // Check recommended fields
      if (!parsed.name) warnings.push("Missing 'name' field");
      if (!parsed.description) warnings.push("Missing 'description' field");
      if (!parsed.version) warnings.push("Missing 'version' field");
      
      // Validate policy arrays
      if (parsed.allow && !Array.isArray(parsed.allow)) {
        errors.push("'allow' must be an array");
      }
      if (parsed.ask && !Array.isArray(parsed.ask)) {
        errors.push("'ask' must be an array");
      }
      if (parsed.block && !Array.isArray(parsed.block)) {
        errors.push("'block' must be an array");
      }
      
      // Validate patterns (check for suspicious regex)
      const allPatterns = [
        ...(parsed.allow || []),
        ...(parsed.ask || []),
        ...(parsed.block || [])
      ];
      
      for (const pattern of allPatterns) {
        if (typeof pattern !== 'string') {
          errors.push(`Invalid pattern: ${pattern} (must be string)`);
          continue;
        }
        
        // Check for suspicious patterns
        if (/\.\*\.\*/.test(pattern)) {
          warnings.push(`Suspicious pattern "${pattern}": multiple wildcards`);
        }
        if (/[\^$\\]/.test(pattern)) {
          warnings.push(`Pattern "${pattern}": contains regex characters (use simple wildcards like *)`);
        }
      }
    }
    
    return { 
      ok: errors.length === 0, 
      valid: errors.length === 0,
      errors, 
      warnings,
      parsed: errors.length === 0 ? parsed : undefined
    };
  } catch (err) {
    return { 
      ok: false, 
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
      warnings: []
    };
  }
}));

// --- Webhook Management ---
app.use("/webhooks", eventHandler(async (req) => {
  if (req.method === 'GET') {
    // If in DB mode, fetch from database
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const webhooks = await getDbWebhooks(auth.organizationId);
      return { webhooks };
    }
    return { webhooks: WEBHOOKS };
  } else if (req.method === 'POST') {
    const { url } = await readBody<{ url: string }>(req);
    if (!url || !url.startsWith('http')) {
      return { ok: false, error: 'Invalid webhook URL' };
    }
    
    // If in DB mode, store in database
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      await addDbWebhook(url, auth.organizationId);
      const webhooks = await getDbWebhooks(auth.organizationId);
      return { ok: true, webhooks };
    }
    
    // Legacy mode - store in memory
    if (!WEBHOOKS.includes(url)) {
      WEBHOOKS.push(url);
      debug('Webhook added:', url);
    }
    return { ok: true, webhooks: WEBHOOKS };
  } else if (req.method === 'DELETE') {
    const { url } = await readBody<{ url: string }>(req);
    
    // If in DB mode, remove from database
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      await removeDbWebhook(url, auth.organizationId);
      const webhooks = await getDbWebhooks(auth.organizationId);
      return { ok: true, webhooks };
    }
    
    // Legacy mode - remove from memory
    const idx = WEBHOOKS.indexOf(url);
    if (idx !== -1) {
      WEBHOOKS.splice(idx, 1);
      debug('Webhook removed:', url);
    }
    return { ok: true, webhooks: WEBHOOKS };
  }
}));

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
    
    // Store in database if in DB mode
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (auth) {
        await updateAgentPolicy(body.agentId, auth.organizationId, resolved, resolved.limits);
      }
    }
    
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
    block: assignment.policy.block,
    limits: assignment.policy.limits
  };
}));

// List all role assignments
app.use("/roles", eventHandler(async (req)=>{
  if (req.method !== 'GET') return;
  return { roles: listRoleAssignments() };
}));

// Events & timeline
app.use("/events", eventHandler(async (req)=>{ 
  if (req.method !== 'POST') {
    // GET request - fetch events from DB or memory
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const events = await getEvents(auth.organizationId);
      return { events };
    } else {
      // Legacy mode - return from memory
      return { events: TIMELINE.slice(0, 1000) };
    }
  }
  
  // POST request - record event
  const e = await readBody<EventMsg>(req);
  const costUsd = extractCostUsd(e);
  
  // Extract request metadata for audit trail
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const ipAddress = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   'unknown';
  
  // Get agent's spend limits from role assignment
  const roleAssignment = getRoleAssignment(e.agent);
  const agentSpendLimits = roleAssignment?.policy?.limits;

  const eventRecord = {
    ...e,
    costUsd: costUsd !== null ? costUsd : e.costUsd,
    userAgent,
    ipAddress,
    // Duration comes from client or defaults to the provided value
    duration: e.duration,
    // Add correlation ID if not present
    correlationId: e.correlationId || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    // Include agent's spend limits
    agentSpendLimits
  };

  if (costUsd !== null) {
    const spendType = e.intent === "llm.chat" ? "llm" : "general";
    
    // Store in database if in DB mode
    if (DB_MODE) {
      const auth = await authenticateRequest(req);
      if (auth) {
        await addDbSpend(auth.organizationId, e.agent, costUsd, spendType, new Date(e.ts ?? now()));
      }
    }
    
    // Also store in memory for backward compatibility
    addSpend(e.agent, costUsd, e.ts ?? now(), spendType);
  }

  // Store in database if in DB mode
  if (DB_MODE) {
    const auth = await authenticateRequest(req);
    if (auth) {
      // Ensure agent exists in database before storing event
      await getOrCreateAgent(e.agent, auth.organizationId);
      await storeEvent(eventRecord, auth.organizationId);
    }
  }

  // Always store in memory for backward compatibility and websocket broadcasts
  const msg = { type:"event", event: eventRecord, ts: eventRecord.ts };
  TIMELINE.unshift(msg); 
  await broadcast(msg);
  await notifyWebhooks(msg);
  debug('Event recorded:', { 
    agent: e.agent, 
    intent: e.intent, 
    target: e.target, 
    costUsd,
    customerId: e.customerId,
    feature: e.feature,
    environment: e.environment
  });
  return { ok:true };
}));

// Audit export (NDJSON format for enterprise) - must come BEFORE /timeline
app.use("/timeline.ndjson", eventHandler((req)=>{
  const ndjson = TIMELINE.map(e => JSON.stringify(e)).join('\n');
  setResponseHeader(req, "Content-Type", "application/x-ndjson");
  setResponseHeader(req, "Content-Disposition", `attachment; filename="echos-timeline-${now()}.ndjson"`);
  return ndjson + '\n';
}));

app.use("/metrics/llm", eventHandler(async (req) => {
  if (req.method !== "GET") return;

  const ts = now();
  const summary = Array.from(SPEND.keys()).map((agent) => {
    const spend = getSpend(agent, ts);
    const limits = getRoleAssignment(agent)?.policy?.limits;
    return {
      agent,
      dailyUsd: spend.daily.totalUsd,
      monthlyUsd: spend.monthly.totalUsd,
      llmDailyUsd: spend.daily.llmUsd,
      llmMonthlyUsd: spend.monthly.llmUsd,
      limits: limits ?? null
    };
  });

  const totals = summary.reduce(
    (acc, cur) => {
      acc.dailyUsd += cur.dailyUsd;
      acc.monthlyUsd += cur.monthlyUsd;
      acc.llmDailyUsd += cur.llmDailyUsd ?? 0;
      acc.llmMonthlyUsd += cur.llmMonthlyUsd ?? 0;
      return acc;
    },
    { dailyUsd: 0, monthlyUsd: 0, llmDailyUsd: 0, llmMonthlyUsd: 0 }
  );

  return { summary, totals };
}));

app.use("/timeline", eventHandler(async (req)=>{
  // Avoid matching .ndjson (already handled above)
  if (req.path?.includes('.ndjson')) return;
  
  // If in database mode, fetch from database
  if (DB_MODE) {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const events = await getEvents(auth.organizationId, 1000);
    return { events };
  }
  
  // Legacy mode - return from memory
  return { events: TIMELINE.slice(0,1000) };
}));

app.use("/timeline/replay", eventHandler(async (req)=>{ 
  const { fromTs, toTs } = await readBody<{fromTs?:number; toTs?:number}>(req); 
  const s=fromTs??0, t=toTs??now(); 
  
  // If in database mode, fetch filtered events from database
  if (DB_MODE) {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // Fetch all events and filter by timestamp (Supabase doesn't have a timestamp column yet, would need migration)
    const allEvents = await getEvents(auth.organizationId, 10000);
    const filtered = allEvents.filter((e: any) => {
      const ts = e.ts || e.event?.ts || 0;
      return ts >= s && ts <= t;
    }).sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0));
    return { events: filtered };
  }
  
  // Legacy mode - filter from memory
  const slice = TIMELINE.filter(e=>e.ts>=s && e.ts<=t).sort((a,b)=>a.ts-b.ts); 
  return { events:slice }; 
}));

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
