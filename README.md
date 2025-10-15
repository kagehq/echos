# Echos

A firewall for AI agents to observe and control every action your agents take in real time.

Unlike passive monitoring tools, Echos intercepts actions *before* they happen, giving you policy-based control and human approval for sensitive operations.

## What is Echos For?

Echos is for **autonomous AI agents** - programs that run independently and take actions on your behalf.

### When You Need Echos:

**✅ Building autonomous agents:**
- **Scheduled bots**: Cron jobs that send daily Slack reports
- **CI/CD automation**: GitHub bots that review PRs and post comments  
- **Monitoring agents**: Alert systems that email/Slack when issues arise
- **Data pipelines**: Scripts that fetch APIs and write to databases
- **Research assistants**: Bots that search, summarize, and file reports
- **Customer support**: Auto-responders with LLM-generated replies
- **Social media bots**: Scheduled posts with approval workflows

**❌ Not for interactive tools:**
- AI coding assistants (Cursor, Copilot, GitHub Copilot) - you're in control
- ChatGPT/Claude conversations - no automated actions
- Tools where you approve each action yourself already

### Why This Matters:

As agents become more capable, they'll need guardrails. Echos gives you:
- **Visibility**: See every action before it happens
- **Control**: Approve/deny sensitive operations in real-time
- **Audit trail**: Track what your agents actually did
- **Policy enforcement**: Set rules once, apply everywhere

**Use Echos when:** You're ready to let an AI agent run autonomously, but want a safety net before it sends that email, deletes that file, or posts to production Slack.

### "I don't have an agent yet. Should I care?"

If you're currently using AI for **interactive coding** (Cursor, Claude, etc.) - you might not need Echos *yet*. 

But if you're thinking about building your first autonomous agent (or already experimenting), Echos helps you ship with confidence. Start with our [examples/](./examples/) to see real agent patterns you can adapt.

**🆕 NEW: VSCode Extension** - Test and control agents directly in your IDE! [Learn more →](./apps/vscode-extension/)

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

**Step 1:** Clone Echos (for daemon & dashboard)
```bash
git clone https://github.com/kagehq/echos.git
cd echos
pnpm install
pnpm build:all
```

**Step 2:** Install the SDK in your agent project
```bash
# In your own project directory
npm install @echoshq/sdk
```

**Step 3:** Import and use in your agent code
```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("my_agent");
await agent.emit("slack.post", "#general", { text: "Hello!" });
```

**Step 4:** Run Echos + your agent (3 terminals)
```bash
# Terminal 1: Start daemon (from echos repo)
cd echos && pnpm dev:daemon

# Terminal 2: Start dashboard (from echos repo)
cd echos && pnpm dev:dashboard

# Terminal 3: Run your agent (from your project)
node your-agent.js
```

Then visit `http://localhost:3000` to see your agent's actions in real-time!

### Use with VSCode Extension

**Test and build agents directly in your IDE:**
- **🔥 Workflow Recorder** - Detects patterns, suggests automation ("You've done this 3 times. Want to automate?")
- **Action Playground** - Test policies without writing code
- **Inline Approvals** - Approve/deny without leaving your editor
- **Code Actions** - Right-click → Wrap with Echos / Convert to Agent
- **Policy Editor** - Visual interface for managing rules
- **Token Manager** - Real-time authorization control

**Quick start:** `pnpm dev:daemon` then press `F5` in VSCode → [Full guide](./apps/vscode-extension/)

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
- **🆕 VSCode Extension** - Test, monitor, and control agents directly in your IDE
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

- **[examples/](./examples/)** - Usage examples and patterns
- **[VSCode Extension](./apps/vscode-extension/)** - IDE integration

## License

FSL-1.1-MIT License. See LICENSE file for details.
