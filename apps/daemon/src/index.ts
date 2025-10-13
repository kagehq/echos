import { createApp, eventHandler, toNodeListener, readBody, setResponseHeader, getRouterParam } from "h3";
import { listen } from "listhen";
import { WebSocketServer } from "ws";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import YAML from "yaml";
import fetch from "node-fetch";

type DecisionStatus = "allow" | "block" | "ask";
const PENDING = new Map<string, (d: any)=>void>();
const CLIENTS = new Set<any>();
const EVENTS: any[] = [];
const MAX_EVENTS = 200;

interface Policy { allow?: string[]; block?: string[]; ask?: string[]; slackWebhook?: string; }
function match(list: string[]|undefined, s: string) { return !!list?.some(p => new RegExp(p.replaceAll("*",".*")).test(s)); }

async function ensurePolicyFile(): Promise<string> {
  const homeDir = process.env.HOME ?? ".";
  const echosDir = join(homeDir, ".echos");
  const policyPath = join(echosDir, "echos.yaml");
  
  try {
    await fs.access(policyPath);
  } catch {
    // File doesn't exist, create it with defaults
    const defaultPolicy = `allow:
  - "llm.chat:.*"
ask:
  - "slack.post:.*"
block:
  - "fs\\\\.delete:.*"
# slackWebhook: "https://hooks.slack.com/services/XXX"
`;
    try {
      await fs.mkdir(echosDir, { recursive: true });
      await fs.writeFile(policyPath, defaultPolicy, "utf8");
      console.log(`Created default policy at ${policyPath}`);
    } catch (err) {
      console.error("Failed to create policy file:", err);
    }
  }
  
  return policyPath;
}

async function loadPolicy(): Promise<Policy> {
  const path = await ensurePolicyFile();
  try {
    const content = await fs.readFile(path, "utf8");
    return YAML.parse(content) as Policy;
  } catch {
    return { allow:[".*llm.*"], ask:[".*slack.*"], block:[".*fs\\.delete.*"] };
  }
}

const app = createApp();

// CORS for dashboard (http://localhost:3000)
app.use(eventHandler((req) => {
  setResponseHeader(req, "Access-Control-Allow-Origin", "*");
  setResponseHeader(req, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  setResponseHeader(req, "Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") {
    return { ok: true } as any;
  }
}));

app.use(eventHandler(async (req) => {
  // Handle POST /decide (policy check) - must NOT match /decide/:id
  if (req.path !== '/decide' || req.method !== 'POST') return;
  
  const body = await readBody<any>(req);
  const p = await loadPolicy();
  const sig = `${body.intent}:${body.target ?? ""}`;
  let status: DecisionStatus = "allow";
  if (match(p.block, sig)) status="block";
  else if (match(p.ask, sig)) status="ask";
  else if (match(p.allow, sig)) status="allow";

  if (status==="ask") {
    await broadcast({ type:"ask", event: body });
  }
  return { status, id: body.id };
}));

app.use("/events/recent", eventHandler(async () => {
  return { events: EVENTS };
}));

app.use("/events", eventHandler(async (req) => {
  const body = await readBody<any>(req);
  EVENTS.unshift(body);
  if (EVENTS.length > MAX_EVENTS) EVENTS.length = MAX_EVENTS;
  await broadcast({ type:"event", event: body });
  return { ok: true };
}));

app.use(eventHandler(async (req) => {
  const match = req.path?.match(/^\/await\/(.+)$/);
  if (!match) return;
  
  const id = match[1];
  const result = await new Promise((resolve) => {
    PENDING.set(id, resolve);
    setTimeout(() => { 
      if (PENDING.has(id)) { 
        PENDING.delete(id); 
        resolve({ id, status:"block" }); 
      } 
    }, 1000*60*2);
  });
  return result;
}));

app.use(eventHandler(async (req) => {
  const match = (req.path || req.url)?.match(/^\/decide\/(.+)$/);
  if (!match) return;
  
  const id = match[1];
  if (req.method !== 'POST') return;
  
  const body = await readBody<any>(req);
  const fn = PENDING.get(id);
  if (fn) { 
    fn({ id, status: body.status }); 
    PENDING.delete(id); 
  }
  await broadcast({ type:"decision", id, status: body.status, ts: Date.now() });
  return { ok:true };
}));

const server = toNodeListener(app);
const wss = new WebSocketServer({ noServer: true });
async function broadcast(msg:any){ const s = JSON.stringify(msg); for (const ws of CLIENTS) { try{ ws.send(s);}catch{} } }

const http = await listen(server, { port: 3434, hostname: "127.0.0.1", name: "echosd" });
http.server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => { 
      CLIENTS.add(ws); 
      ws.on("close", () => CLIENTS.delete(ws));
    });
  } else {
    socket.destroy();
  }
});
console.log("echosd listening on http://127.0.0.1:3434");

