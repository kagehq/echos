import { request } from "undici";
import { nanoid } from "nanoid";

const ENDPOINT = process.env.ECHOS_ENDPOINT ?? "http://127.0.0.1:3434";
const DEBUG_MODE = process.env.ECHOS_DEBUG === "1";

type Decision = "allow"|"block"|"ask";
type SpendLimitInfo = { timeframe: "daily" | "monthly"; category: "llm" | "total"; value: number; spent: number; remaining: number };
type ChaosInjection = { triggered: boolean; latencyMs?: number; blockRate: number; seed?: number };
type PolicyMatch = { status: Decision; rule?: string; source?: string; byToken?: boolean; limit?: SpendLimitInfo; chaos?: ChaosInjection };
export type EchosToken = { token:string; expiresAt:number; scopes:string[]; status:"active"|"paused"|"revoked" };

export type ChaosConfig = {
  enabled?: boolean;
  block_rate?: number;
  latency_ms?: number;
  seed?: number;
  target_intents?: string[];
  exempt_intents?: string[];
};

// Debug logging helper
function debug(...args: any[]) {
  if (DEBUG_MODE) {
    console.log('[ECHOS SDK]', new Date().toISOString(), ...args);
  }
}

// Global headers for API key authentication
let globalHeaders: Record<string, string> = {};

async function postJSON<T=any>(path:string, body:any, customHeaders?: Record<string, string>){ try{
  debug('POST', path, { bodyPreview: JSON.stringify(body).substring(0, 100) });
  const headers = { "content-type":"application/json", ...globalHeaders, ...customHeaders };
  const res = await request(`${ENDPOINT}${path}`, { method:"POST", headers, body: JSON.stringify(body) });
  const data = await res.body.json() as T;
  debug('Response', path, { status: res.statusCode, dataPreview: JSON.stringify(data).substring(0, 100) });
  return data;
}catch(err){ 
  debug('Error', path, err instanceof Error ? err.message : String(err));
  return undefined as any; 
} }

export class EchosClient {
  private chaosConfig?: ChaosConfig;
  
  constructor(public agent="default", private customHeaders?: Record<string, string>, chaosConfig?: ChaosConfig){
    debug('EchosClient created', { agent, endpoint: ENDPOINT, hasCustomHeaders: !!customHeaders, chaosEnabled: !!chaosConfig?.enabled });
    this.chaosConfig = chaosConfig;
  }
  private token: EchosToken | null = null;
  setToken(t:EchosToken|null){ 
    debug('Token set', { agent: this.agent, hasToken: !!t });
    this.token = t; 
  }
  authHeader(){ return (this.token && this.token.status==="active" && Date.now()<this.token.expiresAt) ? {"x-echos-token": this.token.token } : {}; }

  // Chaos injection logic (client-side)
  private shouldInjectChaos(intent: string): boolean {
    if (!this.chaosConfig?.enabled || !this.chaosConfig.block_rate) return false;
    
    // Check if intent is explicitly exempted
    if (this.chaosConfig.exempt_intents?.includes(intent)) return false;
    
    // Check if we should only target specific intents
    if (this.chaosConfig.target_intents && this.chaosConfig.target_intents.length > 0) {
      if (!this.chaosConfig.target_intents.includes(intent)) return false;
    }
    
    // Use seed if provided for reproducible chaos, otherwise use Math.random()
    const random = this.chaosConfig.seed !== undefined 
      ? this.seededRandom(this.chaosConfig.seed)
      : Math.random();
    
    return random < this.chaosConfig.block_rate;
  }

  // Simple seeded random (for reproducible chaos)
  private seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  // Sugar: agent.authorize({ scopes, durationSec, reason })
  async authorize(opts: { scopes: string[], durationSec: number, reason: string }){
    const data = await postJSON<{token:EchosToken}>("/tokens/issue", { agent:this.agent, ...opts }, this.customHeaders);
    if (data?.token) this.token = data.token;
    return data?.token ?? null;
  }

  async requestConsent(scopes:string[], durationSec:number, reason:string){
    const data = await postJSON<{token:EchosToken}>("/tokens/issue", { agent:this.agent, scopes, durationSec, reason }, this.customHeaders);
    if (data?.token) this.token = data.token;
    return data?.token ?? null;
  }

  async emit(intent:string, target?:string, meta?:any, request?:any, response?:any, metadata?:any){
    debug('emit()', { agent: this.agent, intent, target, hasToken: !!this.token });
    
    const evt = { id:nanoid(), ts:Date.now(), agent:this.agent, intent, target, meta, preview:`${intent} → ${target??""}`.trim(), request, response, metadata };
    
    // Client-side chaos injection (for testing SDK behavior)
    if (this.chaosConfig?.enabled && this.shouldInjectChaos(intent)) {
      const errorMsg = `[CHAOS] Simulated failure (block_rate: ${(this.chaosConfig.block_rate || 0) * 100}%)`;
      debug('Chaos injected:', { intent, agent: this.agent });
      throw new Error(errorMsg);
    }
    
    // Inject artificial latency if configured
    if (this.chaosConfig?.enabled && this.chaosConfig.latency_ms && this.chaosConfig.latency_ms > 0) {
      await new Promise(resolve => setTimeout(resolve, this.chaosConfig!.latency_ms));
    }
    
    // Include token in decision request if we have one
    const decidePayload:any = { ...evt };
    if (this.token && this.token.status==="active" && Date.now()<this.token.expiresAt) {
      decidePayload.token = this.token.token;
      debug('Using token for authorization', { scopes: this.token.scopes });
    }
    
    const decision = await postJSON<{status:Decision, id:string, policy?: PolicyMatch, message?: string, duration?: number}>("/decide", decidePayload, this.customHeaders) ?? { status:"allow" as Decision, id:evt.id };
    debug('Policy decision', { status: decision.status, rule: decision.policy?.rule, source: decision.policy?.source, duration: decision.duration });

    if (decision.status === "ask"){
      debug('Waiting for user consent...');
      const wait = await postJSON<{status:"allow"|"block", token?:EchosToken}>(`/await/${evt.id}`, {}, this.customHeaders);
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

    await postJSON("/events", { ...evt, tokenAttached: !!this.token, policy: decision.policy, duration: decision.duration }, this.customHeaders);
    debug('Event recorded', { id: evt.id, duration: decision.duration });
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
      }>("/tokens/introspect", { token }, this.customHeaders);
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
    overrides?: { 
      allow?: string[]; 
      ask?: string[]; 
      block?: string[];
      chaos?: ChaosConfig;
      limits?: Record<string, number>;
    };
  }){
    try {
      const data = await postJSON<{
        ok: boolean;
        policy?: { 
          allow: string[]; 
          ask: string[]; 
          block: string[];
          chaos?: ChaosConfig;
          limits?: Record<string, number>;
        };
        error?: string;
      }>("/roles/apply", {
        agentId: opts.agentId ?? this.agent,
        template: opts.template,
        overrides: opts.overrides
      }, this.customHeaders);
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
      }, this.customHeaders);
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
      }>("/templates/validate", { yaml }, this.customHeaders);
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

  // Get chaos metrics
  async getChaosMetrics(){
    try {
      const res = await request(`${ENDPOINT}/metrics/chaos`, { method: "GET" });
      const data = await res.body.json() as any;
      return data ?? { stats: {}, agentsWithChaos: [], chaosInjectionRate: 0 };
    } catch {
      return { stats: {}, agentsWithChaos: [], chaosInjectionRate: 0 };
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

export function echos(name?:string, chaosConfig?: ChaosConfig){ return new EchosClient(name, undefined, chaosConfig); }

// Create an authenticated client with an API key
export function echosWithApiKey(apiKey: string, agentName?: string, chaosConfig?: ChaosConfig) {
  return new EchosClient(agentName ?? "default", { "x-api-key": apiKey }, chaosConfig);
}

// Set global API key for all future requests (alternative approach)
export function setGlobalApiKey(apiKey: string) {
  globalHeaders["x-api-key"] = apiKey;
}

export * from "./types.js";
