import { request } from "undici";
import { nanoid } from "nanoid";

const ENDPOINT = process.env.ECHOS_ENDPOINT ?? "http://127.0.0.1:3434";
type Decision = "allow"|"block"|"ask";
type PolicyMatch = { status: Decision; rule?: string; source?: string; byToken?: boolean };
export type EchosToken = { token:string; expiresAt:number; scopes:string[]; status:"active"|"paused"|"revoked" };

async function postJSON<T=any>(path:string, body:any){ try{
  const res = await request(`${ENDPOINT}${path}`, { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(body) });
  return await res.body.json() as T;
}catch{ return undefined as any; } }

export class EchosClient {
  constructor(public agent="default"){}
  private token: EchosToken | null = null;
  setToken(t:EchosToken|null){ this.token = t; }
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
    const evt = { id:nanoid(), ts:Date.now(), agent:this.agent, intent, target, meta, preview:`${intent} → ${target??""}`.trim(), request, response, metadata };
    
    // Include token in decision request if we have one
    const decidePayload:any = { ...evt };
    if (this.token && this.token.status==="active" && Date.now()<this.token.expiresAt) {
      decidePayload.token = this.token.token;
    }
    
    const decision = await postJSON<{status:Decision, id:string, policy?: PolicyMatch}>("/decide", decidePayload) ?? { status:"allow" as Decision, id:evt.id };

    if (decision.status === "ask"){
      const wait = await postJSON<{status:"allow"|"block", token?:EchosToken}>(`/await/${evt.id}`, {});
      if (!wait || wait.status!=="allow") throw new Error("Echos: action denied");
      if (wait.token) this.token = wait.token;
    }
    if (decision.status === "block") throw new Error("Echos: action blocked");

    await postJSON("/events", { ...evt, tokenAttached: !!this.token, policy: decision.policy });
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
}

export function echos(name?:string){ return new EchosClient(name); }
export * from "./types.js";
