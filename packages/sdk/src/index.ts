import { request } from "undici";
import { nanoid } from "nanoid";

const ENDPOINT = process.env.ECHOS_ENDPOINT ?? "http://127.0.0.1:3434";
const DEBUG_MODE = process.env.ECHOS_DEBUG === "1";

type Decision = "allow"|"block"|"ask";
type SpendLimitInfo = { timeframe: "daily" | "monthly"; category: "llm" | "total"; value: number; spent: number; remaining: number };
type PolicyMatch = { status: Decision; rule?: string; source?: string; byToken?: boolean; limit?: SpendLimitInfo };
export type EchosToken = { token:string; expiresAt:number; scopes:string[]; status:"active"|"paused"|"revoked" };

// Debug logging helper
function debug(...args: any[]) {
  if (DEBUG_MODE) {
    console.log('[ECHOS SDK]', new Date().toISOString(), ...args);
  }
}

async function postJSON<T=any>(path:string, body:any){ try{
  debug('POST', path, { bodyPreview: JSON.stringify(body).substring(0, 100) });
  const res = await request(`${ENDPOINT}${path}`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
  const data = await res.body.json() as T;
  debug('Response', path, { status: res.statusCode, dataPreview: JSON.stringify(data).substring(0, 100) });
  return data;
}catch(err){ 
  debug('Error', path, err instanceof Error ? err.message : String(err));
  return undefined as any; 
} }

export class EchosClient {
  constructor(public agent="default"){
    debug('EchosClient created', { agent, endpoint: ENDPOINT });
  }
  private token: EchosToken | null = null;
  setToken(t:EchosToken|null){ 
    debug('Token set', { agent: this.agent, hasToken: !!t });
    this.token = t; 
  }
  authHeader(){ return (this.token && this.token.status==="active" && Date.now()<this.token.expiresAt) ? {"x-echos-token": this.token.token } : {}; }

  // Sugar: agent.authorize({ scopes, durationSec, reason })
  async authorize(opts: { scopes: string[], durationSec: number, reason: string }){
    const data = await postJSON<{token:EchosToken}>("/tokens/issue", { agent:this.agent, ...opts });
    if (data?.token) this.token = data.token;
    return data?.token ?? null;
  }

  async requestConsent(scopes:string[], durationSec:number, reason:string){
    const data = await postJSON<{token:EchosToken}>("/tokens/issue", { agent:this.agent, scopes, durationSec, reason });
    if (data?.token) this.token = data.token;
    return data?.token ?? null;
  }

  async emit(intent:string, target?:string, meta?:any, request?:any, response?:any, metadata?:any){
    debug('emit()', { agent: this.agent, intent, target, hasToken: !!this.token });
    
    const evt = { id:nanoid(), ts:Date.now(), agent:this.agent, intent, target, meta, preview:`${intent} → ${target??""}`.trim(), request, response, metadata };
    
    // Include token in decision request if we have one
    const decidePayload:any = { ...evt };
    if (this.token && this.token.status==="active" && Date.now()<this.token.expiresAt) {
      decidePayload.token = this.token.token;
      debug('Using token for authorization', { scopes: this.token.scopes });
    }
    
    const decision = await postJSON<{status:Decision, id:string, policy?: PolicyMatch, message?: string}>("/decide", decidePayload) ?? { status:"allow" as Decision, id:evt.id };
    debug('Policy decision', { status: decision.status, rule: decision.policy?.rule, source: decision.policy?.source });

    if (decision.status === "ask"){
      debug('Waiting for user consent...');
      const wait = await postJSON<{status:"allow"|"block", token?:EchosToken}>(`/await/${evt.id}`, {});
      if (!wait || wait.status!=="allow") {
        const errorMsg = decision.message || "Echos: action denied";
        debug('Action denied', { message: errorMsg });
        throw new Error(errorMsg);
      }
      if (wait.token) {
        debug('Token granted by user', { scopes: wait.token.scopes });
        this.token = wait.token;
      }
    }
    if (decision.status === "block") {
      const errorMsg = decision.message || "Echos: action blocked";
      debug('Action blocked', { message: errorMsg, rule: decision.policy?.rule });
      throw new Error(errorMsg);
    }

    await postJSON("/events", { ...evt, tokenAttached: !!this.token, policy: decision.policy });
    debug('Event recorded', { id: evt.id });
    return evt;
  }

  async fetch(input:any, init?:any){
    const url = typeof input==="string" ? input : input?.toString?.() ?? "";
    await this.emit("http.request", url, { method: init?.method ?? "GET" });
    const headers = { ...(init?.headers||{}), ...this.authHeader() };
    return { ok: true, status: 200 }; // Stub for now
  }

  // Introspect a token to check its validity and get details
  async introspect(token: string){
    try {
      const data = await postJSON<{
        active: boolean; 
        status?: string; 
        agent?: string; 
        scopes?: string[]; 
        expiresAt?: number;
        tokenHash?: string;
      }>("/tokens/introspect", { token });
      return data ?? { active: false };
    } catch {
      return { active: false };
    }
  }

  // List available policy templates
  async listTemplates(){
    try {
      const res = await request(`${ENDPOINT}/templates`, { method: "GET" });
      const data = await res.body.json() as any;
      return data?.templates ?? [];
    } catch {
      return [];
    }
  }

  // Apply a role/template to this agent (or another agent)
  async applyRole(opts: {
    agentId?: string;
    template: string;
    overrides?: { allow?: string[]; ask?: string[]; block?: string[] };
  }){
    try {
      const data = await postJSON<{
        ok: boolean;
        policy?: { allow: string[]; ask: string[]; block: string[] };
        error?: string;
      }>("/roles/apply", {
        agentId: opts.agentId ?? this.agent,
        template: opts.template,
        overrides: opts.overrides
      });
      return data;
    } catch {
      return { ok: false, error: "Failed to apply role" };
    }
  }

  // Get the resolved policy for this agent (or another agent)
  async getPolicy(agentId?: string){
    try {
      const id = agentId ?? this.agent;
      const res = await request(`${ENDPOINT}/roles/${encodeURIComponent(id)}`, { method: "GET" });
      const data = await res.body.json() as any;
      return data;
    } catch {
      return { agentId: agentId ?? this.agent, allow: [], ask: [], block: [], template: null };
    }
  }

  // List all role assignments
  async listRoles(){
    try {
      const res = await request(`${ENDPOINT}/roles`, { method: "GET" });
      const data = await res.body.json() as any;
      return data?.roles ?? [];
    } catch {
      return [];
    }
  }

  // Test a policy without running the agent (dry-run)
  async testPolicy(opts: {
    agent?: string;
    intent: string;
    target?: string;
    policy?: { allow?: string[]; ask?: string[]; block?: string[] };
  }){
    try {
      const data = await postJSON<{
        ok: boolean;
        status?: string;
        rule?: string;
        source?: string;
        signature?: string;
        message?: string;
        error?: string;
      }>("/policy/test", {
        agent: opts.agent ?? this.agent,
        intent: opts.intent,
        target: opts.target,
        policy: opts.policy
      });
      return data ?? { ok: false, error: "Request failed" };
    } catch {
      return { ok: false, error: "Failed to test policy" };
    }
  }

  // Validate a YAML template
  async validateTemplate(yaml: string){
    try {
      const data = await postJSON<{
        ok: boolean;
        valid: boolean;
        errors: string[];
        warnings: string[];
        parsed?: any;
      }>("/templates/validate", { yaml });
      return data ?? { ok: false, valid: false, errors: ["Request failed"], warnings: [] };
    } catch {
      return { ok: false, valid: false, errors: ["Failed to validate template"], warnings: [] };
    }
  }

  // List webhooks
  async listWebhooks(){
    try {
      const res = await request(`${ENDPOINT}/webhooks`, { method: "GET" });
      const data = await res.body.json() as any;
      return data?.webhooks ?? [];
    } catch {
      return [];
    }
  }

  // Add a webhook
  async addWebhook(url: string){
    try {
      const data = await postJSON<{
        ok: boolean;
        webhooks?: string[];
        error?: string;
      }>("/webhooks", { url });
      return data ?? { ok: false, error: "Request failed" };
    } catch {
      return { ok: false, error: "Failed to add webhook" };
    }
  }

  // Remove a webhook
  async removeWebhook(url: string){
    try {
      const res = await request(`${ENDPOINT}/webhooks`, { 
        method: "DELETE",
        body: JSON.stringify({ url }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.body.json() as any;
      return { ok: true, webhooks: data?.webhooks ?? [] };
    } catch {
      return { ok: false, error: "Failed to remove webhook" };
    }
  }

  // Test input filtering
  async testInputFilter(content: string, policy?: 'strict' | 'balanced' | 'permissive'){
    try {
      const data = await postJSON<{
        ok: boolean;
        allowed: boolean;
        sanitized: string;
        warnings: string[];
        classifications: string[];
        redactions: Array<{
          pattern: string;
          position: number;
          length: number;
          category: string;
        }>;
        policy: string;
        error?: string;
      }>("/input-filter/test", { content, policy });
      return data ?? { 
        ok: false, 
        allowed: false, 
        sanitized: content, 
        warnings: ["Request failed"], 
        classifications: [], 
        redactions: [],
        policy: 'balanced'
      };
    } catch {
      return { 
        ok: false, 
        allowed: false, 
        sanitized: content, 
        warnings: ["Failed to test input filter"], 
        classifications: [], 
        redactions: [],
        policy: 'balanced'
      };
    }
  }
}

export function echos(name?:string){ return new EchosClient(name); }
export * from "./types.js";
