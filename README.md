# Echos

**Echos** is a Wireshark for AI agents to visualize and control AI agent actions locally. A local visibility layer for AI agents.
Watch every action (see or block) your agent takes in real time.

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build packages

```bash
pnpm build:sdk
pnpm build:demo
```

### 3. Run the demo

```bash
npx @echos/demo
```

This will:
- Start the daemon on http://127.0.0.1:3434
- Start the dashboard on http://localhost:3000
- Open the dashboard in your browser
- Run a demo agent that performs 3 actions:
  1. LLM chat (allowed by default)
  2. Slack post (asks for permission)
  3. File delete (blocked by default)

## Manual Development

### Start daemon

```bash
pnpm -C apps/daemon dev
```

### Start dashboard

```bash
pnpm -C apps/dashboard dev
```

### Use SDK in your code

```typescript
import { echos } from "@echos/sdk";

const agent = echos("my_agent");

// Emit actions - they'll be checked against policy
await agent.emit("llm.chat", "openai.chat", { prompt: "hello" });
await agent.emit("slack.post", "#general", { text: "hi!" });

// Action types available:
// - llm.chat - LLM API calls
// - http.request - HTTP requests
// - email.send - Email operations
// - slack.post - Slack messages
// - fs.delete - File deletions

// Graceful fallback - if daemon is unreachable, actions are auto-allowed
try {
  await agent.emit("slack.post", "#alerts", { text: "Deploy complete!" });
} catch (error) {
  console.log("Action denied by policy");
}
```

## Policy Configuration

The daemon uses `~/.echos/echos.yaml` for policy rules:

```yaml
allow:
  - "llm.chat:.*"
ask:
  - "slack.post:.*"
block:
  - "fs\\.delete:.*"
# slackWebhook: "https://hooks.slack.com/services/XXX"
```

Policy patterns use regex matching on `intent:target` signatures.

### How it works:

1. **Agent emits action** via SDK (`@echos/sdk`)
2. **Daemon checks policy** (`~/.echos/echos.yaml`)
   - `allow` → Action proceeds immediately
   - `block` → Action is denied immediately
   - `ask` → Wait for human decision
3. **Dashboard shows modal** (if `ask`)
4. **Human decides** → Allow or Deny
5. **Action completes or throws error**

## Features

- ✅ Real-time WebSocket feed of agent actions with timestamps
- ✅ Policy-based action control (allow/ask/block)
- ✅ Interactive consent modal for "ask" actions
- ✅ Local-first - all data stays on your machine
- ✅ Hot-reload policy changes without restart
- ✅ In-memory event history
- ✅ Color-coded decisions (green = allow, red = deny)

## Security & Privacy

- Everything runs locally by default
- No action payloads stored, only metadata
- Set `ECHOS_LOCAL_ONLY=1` to disable network calls
- Policy file auto-created on first run

## Documentation

- **[examples/](./examples/)** - Code examples and custom policy configurations

## License

FSL-1.1-MIT License. See LICENSE file for details.

