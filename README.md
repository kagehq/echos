# Echos

A Wireshark for AI agents. Visualize and control every action your agents take in real time.

## Installation

```bash
npm install @echoshq/sdk
```

or

```bash
pnpm add @echoshq/sdk
```

## Quick Start

### Try the Demo

Fastest way to see Echos in action:

```bash
git clone https://github.com/kagehq/echos.git
cd echos
pnpm install
pnpm build:all
pnpm demo
```

The demo starts the daemon (`:3434`), dashboard (`:3000`), and runs a sample agent showing allowed, blocked, and consent-required actions.

### Use in Your Project

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("my_agent");
await agent.emit("slack.post", "#general", { text: "Hello!" });
```

Then start the Echos daemon and dashboard separately to monitor your agent.

## Development

```bash
pnpm dev:daemon    # Start daemon
pnpm dev:dashboard # Start dashboard in another terminal
```

## Usage

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("my_agent");

// Emit actions (checked against policy)
await agent.emit("slack.post", "#general", { text: "Deploy complete!" });

// Emit with request/response/metadata for debugging
await agent.emit(
  "http.request",
  "https://api.example.com",
  { method: "GET" },
  { url: "https://api.example.com", headers: {...} },  // request
  { status: 200, data: {...} },                        // response
  { latency: "142ms", retries: 0 }                     // metadata
);

// Request persistent authorization
await agent.authorize({
  scopes: ["slack.post", "email.send"],
  durationSec: 3600, // 1 hour
  reason: "Deploy notifications"
});

// Available scopes (based on official taxonomy):
// - llm.chat - LLM API calls
// - http.request - HTTP requests
// - email.send/email.read - Email operations
// - slack.post/slack.read - Slack messages
// - calendar.read/calendar.write - Calendar events
// - fs.read/fs.write/fs.delete - File operations
```

## How It Works

1. Agent emits action via SDK
2. Daemon checks policy → `allow`, `block`, or `ask`
3. If `ask`, dashboard shows consent modal
4. Human approves (once or with time-limited token)
5. Action proceeds or throws error

### Policy Configuration

Create `~/.echos/echos.yaml` with regex patterns:

```yaml
allow:
  - "llm.chat:.*"
ask:
  - "slack.post:.*"
  - "calendar.*:.*"
block:
  - "fs\\.delete:.*"
```

## Features

- **Live Feed** - Real-time WebSocket stream with search and filtering
- **Timeline** - Historical audit log with search and expandable details
- **Metrics** - Performance analytics, activity charts, and top intents
- **Event Details** - Click any event to see full request/response/metadata
- **Token Management** - View, pause, resume, revoke authorizations
- **Policy Engine** - Regex-based allow/ask/block rules
- **JWT Auth** - Scope-based tokens with expiry
- **Local-First** - All data stays on your machine
- **NDJSON Export** - Compliance-ready audit logs

## Configuration

```bash
ECHOS_PORT=3434        # HTTP port (default: 3434)
ECHOS_HOST=127.0.0.1   # Bind address
ECHOS_SECRET=...       # JWT key (auto-generated)
ECHOS_LOCAL_ONLY=1     # Disable network (optional)
```

## Security

- Local-only by default (127.0.0.1)
- JWT tokens (HS256) with scope-based auth
- No action payloads stored
- Fail-open if daemon unreachable

## More

- **[npm package](https://www.npmjs.com/package/@echoshq/sdk)** - View on npm
- **[QUICKSTART.md](./QUICKSTART.md)** - Detailed setup guide
- **[examples/](./examples/)** - Usage examples

## License

FSL-1.1-MIT License. See LICENSE file for details.
