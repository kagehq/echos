# Echos

A firewall for AI agents to observe and control every action your agents take in real time.

Unlike passive monitoring tools, Echos intercepts actions *before* they happen, giving you policy-based control and human approval for sensitive operations.


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

// Request persistent authorization
await agent.authorize({
  scopes: ["slack.post", "email.send"],
  durationSec: 3600,
  reason: "Deploy notifications"
});
```

**Other methods:** `introspect()`, `listTemplates()`, `applyRole()`, `getPolicy()`, `listRoles()`, `testPolicy()`, `validateTemplate()`, `addWebhook()`

**Available scopes:** `llm.chat`, `http.request`, `email.send/read`, `slack.post/read`, `calendar.read/write`, `fs.read/write/delete`

## How It Works

1. Agent emits action via SDK
2. Daemon checks policy → `allow`, `block`, or `ask`
3. If `ask`, dashboard shows consent modal
4. Human approves (once or with time-limited token)
5. Action proceeds or throws error

### Policy Configuration

Create `~/.echos/echos.yaml` or apply role templates:

```yaml
name: "Custom Bot"
allow:
  - "llm.chat:*"
  - "http.request:GET*"
ask:
  - "slack.post:.*"
  - "email.send:*"
block:
  - "fs.delete:*"
```

**Built-in templates:** `research_assistant`, `customer_support`, `internal_notifier`, `unrestricted`

Apply via dashboard (`:3000/roles`) or `agent.applyRole({ template: "research_assistant" })`

## Features

- **Live Feed & Timeline** - Real-time event stream with search, filtering, and audit logs
- **Metrics Dashboard** - Performance analytics and activity charts
- **Role Templates** - Pre-configured policies with hot-reload
- **Token Management** - Time-limited authorizations with full lifecycle control
- **Developer Tools** - Policy testing, template validation, webhook support, debug mode
- **Security** - Regex-based policies with ReDoS protection, JWT auth, timeout protection
- **Local-First** - All data stays on your machine, NDJSON export for compliance

## Configuration

```bash
ECHOS_PORT=3434        # HTTP port
ECHOS_HOST=127.0.0.1   # Bind address
ECHOS_DEBUG=1          # Verbose logging
```

## Security

- Local-only by default (127.0.0.1), JWT tokens (HS256), scope-based auth
- Secure defaults: unknown intents blocked, failures default to block
- ReDoS protection (100ms timeout), API timeout protection (3-10s)
- No action payloads stored, only metadata logged

## More

- **[QUICKSTART.md](./QUICKSTART.md)** - Detailed setup guide
- **[examples/](./examples/)** - Usage examples

## License

FSL-1.1-MIT License. See LICENSE file for details.
