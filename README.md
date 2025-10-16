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
pnpm install && pnpm build:all && pnpm demo
```

Visit `http://localhost:3000` to see the dashboard.

### Use in Your Project

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

## VSCode Extension

**Build agents directly in your IDE:**
- **Workflow Recorder** - Detects patterns, suggests automation
- **Action Playground** - Test policies without writing code
- **Inline Approvals** - Approve/deny in your editor
- **Code Actions** - Right-click → Wrap with Echos / Convert to Agent

[Install guide →](./apps/vscode-extension/)

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

**Built-in templates:** `research_assistant`, `customer_support`, `internal_notifier`, `unrestricted`

## Features

- **Real-time monitoring** - Live feed of all agent actions
- **Policy-based control** - Allow/ask/block rules with templates
- **Human-in-the-loop** - Approve sensitive actions before they run
- **Token management** - Time-limited authorizations
- **VSCode extension** - Complete IDE integration
- **Local-first** - All data stays on your machine
- **Audit trail** - Full history with NDJSON export

## More

- **[Examples](./examples/)** - Agent patterns and recipes
- **[VSCode Extension](./apps/vscode-extension/)** - IDE integration
- **[SDK Docs](./packages/sdk/)** - Full API reference

## License

FSL-1.1-MIT License. See LICENSE file for details.
