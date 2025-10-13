export type ActionIntent =
  | "llm.chat"
  | "http.request"
  | "email.send"
  | "slack.post"
  | "fs.delete";

export type ActionStatus = "pending" | "allowed" | "blocked" | "ask";

export interface ActionEvent {
  id: string;
  ts: number;
  agent: string;
  intent: ActionIntent;
  target?: string;
  meta?: Record<string, any>;
  preview?: string; // short human summary
}

export interface Decision {
  id: string;
  status: "allow" | "block";
  reason?: string;
}

