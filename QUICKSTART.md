# Echos - Quick Start

## Setup

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build:all

# Run the demo
pnpm demo
```

The demo starts the daemon (`:3434`), dashboard (`:3000`), and runs a sample agent with 3 actions:

- ✅ LLM chat → allowed
- ⚠️  Slack post → asks permission (modal appears!)
- ❌ File delete → blocked

**Try it**: When the modal appears, click "Allow 1h" to grant a token, then watch subsequent actions auto-approve!

## Usage

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("my_agent");

// Emit actions (checked against policy)
await agent.emit("slack.post", "#general", { text: "Deploy complete!" });

// Emit with debugging details (request/response/metadata)
await agent.emit(
  "http.request",
  "https://api.example.com",
  { method: "GET" },
  { url: "https://api.example.com", headers: {...} },  // request
  { status: 200, data: {...} },                        // response
  { latency: "142ms" }                                 // metadata
);

// Request token for repeated actions
await agent.authorize({
  scopes: ["slack.post", "email.send"],
  durationSec: 3600,
  reason: "Deploy notifications"
});

// Blocked actions throw errors
try {
  await agent.emit("fs.delete", "/data.json");
} catch (err) {
  console.log("Blocked:", err.message);
}
```

## Policy Configuration

Edit `~/.echos/echos.yaml` (created on first run):

```yaml
allow:
  - "llm.chat:.*"        # Auto-allow LLM calls
ask:
  - "slack.post:.*"      # Require consent
  - "email.send:.*"
block:
  - "fs\\.delete:.*"     # Always block
```

Changes apply immediately (no restart needed).

## Development

Run services separately:

```bash
# Terminal 1
pnpm dev:daemon

# Terminal 2  
pnpm dev:dashboard

# Terminal 3
tsx your-agent.ts
```

## Dashboard

- **Feed** (`/`) - Live stream with WebSocket, search, and refresh
- **Timeline** (`/timeline`) - Historical audit log with search
- **Metrics** (`/metrics`) - Performance analytics, activity charts, and statistics
- **Expandable Events** - Click any event to see request/response/metadata details
- **Token Management** - Manage authorizations (pause/resume/revoke)
- **Consent Modal** - Approve actions with "Deny", "Allow once", or "Allow 1h"

## Available Scopes

`llm.chat`, `http.request`, `email.send`, `email.read`, `slack.post`, `slack.read`, `calendar.read`, `calendar.write`, `fs.read`, `fs.write`, `fs.delete`

## Next Steps

- Check `examples/` for usage patterns
- See `README.md` for full docs
- Run `pnpm test` to verify your setup
