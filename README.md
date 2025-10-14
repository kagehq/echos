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

// Introspect a token
const info = await agent.introspect("eyJhbGc...");
// Returns: { active, status, agent, scopes, expiresAt, tokenHash }

// List available policy templates
const templates = await agent.listTemplates();
// Returns: [{ id, name, version, description, allow, ask, block }, ...]

// Apply a role/template to your agent
await agent.applyRole({
  template: "research_assistant",
  overrides: { allow: ["calendar.write:*"] }
});

// Get the resolved policy for your agent
const policy = await agent.getPolicy();
// Returns: { agentId, template, allow, ask, block, appliedAt }

// List all role assignments
const roles = await agent.listRoles();
// Returns: [{ agentId, template, policy, appliedAt }, ...]

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

### Roles & Templates

Apply pre-configured policy templates to agents for faster setup and consistency:

**Built-in Templates:**
- `research_assistant` - Read-only access (LLM, HTTP GET, calendar/email read)
- `customer_support` - Draft responses, requires approval to send
- `internal_notifier` - Posts to internal Slack channels, drafts emails
- `unrestricted` - Full access for trusted agents

**Usage:**

Via Dashboard (`:3000/roles`):
1. Enter agent ID
2. Select template
3. Optionally add custom overrides
4. Apply → agent immediately uses new policy

Via API:
```bash
curl -X POST http://127.0.0.1:3434/roles/apply \
  -H 'content-type: application/json' \
  -d '{"agentId":"my_bot","template":"research_assistant"}'
```

**Custom Templates:**

Create YAML files in `apps/daemon/templates/`:
```yaml
name: "Custom Bot"
version: 1
description: "Reads data, sends notifications"
allow:
  - "llm.chat:*"
  - "http.request:GET*"
  - "slack.post:#alerts"
ask:
  - "email.send:*@company.com"
block:
  - "fs.delete:*"
```

Templates hot-reload automatically when files change. Role assignments persist across daemon restarts.

## Features

- **Live Feed** - Real-time WebSocket stream with search and filtering
- **Timeline** - Historical audit log with search and expandable details
- **Metrics** - Performance analytics, activity charts, and top intents
- **Roles & Templates** - Pre-configured policy templates with hot-reload
- **Event Details** - Click any event to see full request/response/metadata
- **Token Management** - View, pause, resume, revoke authorizations
- **Policy Engine** - Regex-based allow/ask/block rules with ReDoS protection
- **JWT Auth** - Scope-based tokens with expiry
- **Watchdog Timer** - Timeout protection (3-10s) prevents hanging requests
- **Error Handling** - Graceful degradation with user-friendly error messages
- **Local-First** - All data stays on your machine (file-based policies)
- **NDJSON Export** - Compliance-ready audit logs

## Configuration

```bash
ECHOS_PORT=3434        # HTTP port (default: 3434)
ECHOS_HOST=127.0.0.1   # Bind address
ECHOS_SECRET=...       # JWT key (auto-generated)
ECHOS_LOCAL_ONLY=1     # Disable network (optional)
```

## Security

- **Local-only by default** (127.0.0.1)
- **JWT tokens** (HS256) with scope-based auth
- **Token introspection** - Inspect token validity, scopes, and expiry with hashed IDs
- **Secure defaults** - Unknown intents are blocked (fail-closed)
- **Role-based policies** - Apply templates per agent with persistent assignments
- **ReDoS protection** - 100ms timeout on regex evaluation
- **Timeout protection** - API calls timeout after 3-10 seconds
- **Error handling** - Failures default to block, never allow
- **No action payloads stored** - Only metadata logged
- **Security logging** - All security events tagged for monitoring

## More

- **[QUICKSTART.md](./QUICKSTART.md)** - Detailed setup guide
- **[examples/](./examples/)** - Usage examples

## License

FSL-1.1-MIT License. See LICENSE file for details.
