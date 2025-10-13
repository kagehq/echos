import { request } from "undici";
import { nanoid } from "nanoid";
import type { ActionEvent, Decision } from "./types.js";

const ENDPOINT = process.env.ECHOS_ENDPOINT ?? "http://127.0.0.1:3434";

async function postJSON(path: string, body: any) {
  try {
    await request(`${ENDPOINT}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" }
    });
  } catch {}
}

export class EchosClient {
  agent: string;
  constructor(agent: string) { this.agent = agent; }

  async emit(intent: ActionEvent["intent"], target?: string, meta?: any) {
    const evt: ActionEvent = {
      id: nanoid(),
      ts: Date.now(),
      agent: this.agent,
      intent, target, meta,
      preview: `${intent} → ${target ?? ""}`.trim()
    };
    // Ask daemon for policy decision:
    const res = await request(`${ENDPOINT}/decide`, {
      method: "POST",
      body: JSON.stringify(evt),
      headers: { "content-type": "application/json" }
    }).catch(() => null);

    const decision = res ? await res.body.json() as { status: "allow" | "block" | "ask" } : { status: "allow" };

    if (decision.status === "ask") {
      // wait for user decision
      const wait = await request(`${ENDPOINT}/await/${evt.id}`).then(r => r.body.json() as Promise<Decision>).catch(() => ({ status: "block" }));
      if (wait.status !== "allow") throw new Error("Echos: action denied");
    } else if (decision.status === "block") {
      throw new Error("Echos: action blocked by policy");
    }

    await postJSON("/events", evt);
    return evt;
  }

  // Convenience wrappers
  async fetch(input: string, init?: { method?: string; [key: string]: any }) {
    await this.emit("http.request", input, { method: init?.method ?? "GET" });
    // Note: fetch is not available in Node by default, use undici or node-fetch
    return { ok: true, status: 200 }; // Stub for now
  }
}

export function echos(agentName = "default") {
  return new EchosClient(agentName);
}

export * from "./types.js";

