import { request } from "undici";
import { nanoid } from "nanoid";

const ENDPOINT = process.env.ECHOS_ENDPOINT ?? "http://127.0.0.1:3434";
type Decision = "allow"|"block"|"ask";
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
    
    const decision = await postJSON<{status:Decision, id:string}>("/decide", decidePayload) ?? { status:"allow" as Decision, id:evt.id };

    if (decision.status === "ask"){
      const wait = await postJSON<{status:"allow"|"block", token?:EchosToken}>(`/await/${evt.id}`, {});
      if (!wait || wait.status!=="allow") throw new Error("Echos: action denied");
      if (wait.token) this.token = wait.token;
    }
    if (decision.status === "block") throw new Error("Echos: action blocked");

    await postJSON("/events", { ...evt, tokenAttached: !!this.token });
    return evt;
  }

  async fetch(input:any, init?:any){
    const url = typeof input==="string" ? input : input?.toString?.() ?? "";
    await this.emit("http.request", url, { method: init?.method ?? "GET" });
    const headers = { ...(init?.headers||{}), ...this.authHeader() };
    return { ok: true, status: 200 }; // Stub for now
  }
}

export function echos(name?:string){ return new EchosClient(name); }
export * from "./types.js";
