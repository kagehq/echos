# Echos

A firewall for AI agents. Control every action your agents take in real-time.

Echos intercepts actions *before* they happen, giving you policy-based control and human approval for sensitive operations.

## What is Echos For?

**Autonomous AI agents** - programs that run independently and take actions on your behalf:
- Scheduled bots (Slack reports, email summaries)
- CI/CD automation (PR reviews, deploy notifications)
- Monitoring agents (alerts, health checks)
- Research assistants (search, summarize, report)
- Data pipelines (API fetching, database writes)

**Not for interactive tools** like Cursor/Copilot where you're already in control.

**Use Echos when:** You want an AI agent to run autonomously, but need a safety net before it sends that email, deletes that file, or posts to Slack.

## Quick Start

```bash
# Try the demo
git clone https://github.com/kagehq/echos.git
cd echos

# Install the embedded Node runtime (once per machine)
pnpm run setup:node

# Load the local toolchain for the current shell
source scripts/env.sh

# Install dependencies and run the demo
pnpm install
pnpm build:all
pnpm demo
```

Visit `http://localhost:3000` to see the dashboard.

### Development

Use two terminals (after `source scripts/env.sh` in each):

```bash
pnpm dev:daemon    # http://127.0.0.1:3434
pnpm dev:dashboard # http://localhost:3000
```

Or start both services together:

```bash
pnpm dev:stack
```

## Track AI Spend & Enforce Limits

Include the dollar cost on any `llm.chat` event to unlock spend tracking:

```ts
await agent.emit(
  "llm.chat",
  "gpt-4",
  { prompt: "Analyze sales data" },
  undefined,
  undefined,
  {
    costUsd: 0.75,
    provider: "openai",
  }
);
```

Add spend limits to policies:

```yaml
name: Research Assistant
allow:
  - "llm.chat:*"
limits:
  ai_daily_usd: 10     # Block after $10/day
  ai_monthly_usd: 100  # Block after $100/month
```

When limits are exceeded, the agent gets blocked automatically.

### Per-User Spend Caps

For SaaS applications, create users with individual spend limits:

```typescript
// Create a user with spend caps
const user = await createUser({
  userId: 'customer-123',
  dailyLimit: 10.00,
  monthlyLimit: 200.00,
  scopes: ['llm.chat', 'http.request']
});

// User gets API key: user.token
// Automatic spend enforcement: ✅
```

**API Endpoints:**
- `POST /roles/apply` - Assign policy template to user
- `POST /tokens/issue` - Issue API key for user  
- `GET /metrics/llm` - Monitor spend per user
- `POST /tokens/revoke` - Revoke user's API key

**Built-in Templates:**
- `capped_user` - Individual user with spend limits
- `research_assistant` - Read-only access
- `customer_support` - Limited permissions with approval
- `unrestricted` - Full access (admin only)

See [`examples/user-management.ts`](./examples/user-management.ts) and [`examples/cloudflare-integration.ts`](./examples/cloudflare-integration.ts) for complete implementations.

## Use in Your Project

```bash
npm install @echoshq/sdk
```

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("my_agent");
await agent.emit("slack.post", "#general", { text: "Hello!" });
```

Run the daemon in your Echos repo:
```bash
pnpm dev:daemon    # Port 3434
pnpm dev:dashboard # Port 3000
```

## How It Works

1. Agent emits action via SDK
2. Daemon checks policy → `allow`, `block`, or `ask`
3. If `ask`, dashboard/IDE shows consent modal
4. Human approves (once or with time-limited token)
5. Action proceeds or throws error

## Policy Example

```yaml
allow:
  - "llm.chat:*"
  - "http.request:GET*"
ask:
  - "slack.post:.*"
  - "email.send:*"
block:
  - "fs.delete:*"
```

Apply via dashboard or SDK:
```typescript
agent.applyRole({ template: "research_assistant" });
```

## VSCode Extension

**Build agents directly in your IDE:**
- **Workflow Recorder** - Detects patterns, suggests automation
- **Action Playground** - Test policies without writing code
- **Inline Approvals** - Approve/deny in your editor
- **Code Actions** - Right-click → Wrap with Echos / Convert to Agent

[Install guide →](./apps/vscode-extension/)

## Features

- **Real-time monitoring** - Live feed of all agent actions
- **Policy-based control** - Allow/ask/block rules with templates
- **Human-in-the-loop** - Approve sensitive actions before they run
- **Spend tracking & limits** - Per-user cost monitoring with automatic enforcement
- **Programmatic user management** - Create users, issue API keys, set spend caps
- **VSCode extension** - Complete IDE integration
- **Local-first** - All data stays on your machine
- **Audit trail** - Full history with NDJSON export

## More

- **[Examples](./examples/)** - Agent patterns and recipes
- **[VSCode Extension](./apps/vscode-extension/)** - IDE integration
- **[SDK Docs](./packages/sdk/)** - Full API reference

## License

FSL-1.1-MIT License. See LICENSE file for details.