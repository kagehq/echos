# Echos

A Wireshark for AI agents. Visualize and control every action your agents take in real time.

## Quick Start

```bash
# Install and build
pnpm install
pnpm build:all

# Run the interactive demo
pnpm demo
```

The demo starts the daemon (`:3434`), dashboard (`:3000`), and runs a sample agent showing allowed, blocked, and consent-required actions.

## Development

```bash
pnpm dev:daemon    # Start daemon
pnpm dev:dashboard # Start dashboard in another terminal
```

## Usage

```typescript
import { echos } from "@echos/sdk";

const agent = echos("my_agent");

// Emit actions (checked against policy)
await agent.emit("slack.post", "#general", { text: "Deploy complete!" });

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

- **Live Feed** - Real-time WebSocket with auto-reconnect
- **Timeline** - Historical audit log with replay
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

- **[QUICKSTART.md](./QUICKSTART.md)** - Detailed setup guide
- **[examples/](./examples/)** - Usage examples

## License

FSL-1.1-MIT License. See LICENSE file for details.

