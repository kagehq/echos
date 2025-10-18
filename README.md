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

## Community & Support

Join our Discord community for discussions, support, and updates:

[![Discord](https://img.shields.io/badge/Discord-Join%20our%20community-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KqdBcqRk5E)

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

## Use in Your Project

```bash
npm install @echoshq/sdk
```

### Minimal SDK Example

```ts
import { echos } from '@echoshq/sdk';

const agent = echos('my_agent');

await agent.emit('slack.post', '#general', { text: 'Hello!' });
```

### Node / TypeScript

```ts
import { echos } from '@echoshq/sdk';

const guard = echos(`pipeline-${runId}`);

// Apply caps once per agent (optional override per customer)
await guard.applyRole({
  template: 'research_assistant',
  overrides: {
    limits: {
      ai_daily_usd: 10,
      ai_monthly_usd: 50,
      llm_daily_usd: 5
    }
  }
});

export async function callLLM(prompt: string) {
  const costUsd = await estimateCost(prompt); // or provider usage once you get it

  await guard.emit(
    'llm.chat',
    'gpt-4o',
    { prompt },
    undefined,
    undefined,
    { costUsd, provider: 'openai' }
  );

  return openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }]
  });
}
```

### Python

The REST API gives you the same flow without a dedicated SDK:

```py
import os, time, requests
from uuid import uuid4

ECHOS = os.getenv("ECHOS_ENDPOINT", "http://127.0.0.1:3434")
AGENT = os.getenv("ECHOS_AGENT", "python-agent")

def emit(intent, target=None, metadata=None, request_body=None):
    event = {
        "id": str(uuid4()),
        "ts": int(time.time() * 1000),
        "agent": AGENT,
        "intent": intent,
        "target": target,
        "metadata": metadata,
        "request": request_body,
    }

    resp = requests.post(f"{ECHOS}/decide", json=event, timeout=5).json()
    if resp["status"] != "allow":
        raise PermissionError(resp.get("message", "Action blocked or requires approval"))

    requests.post(f"{ECHOS}/events", json=event, timeout=5)
    return resp

# Example usage
cost_usd = 0.42  # supply the provider cost
emit("llm.chat", "gpt-4o", metadata={"costUsd": cost_usd, "provider": "openai"})
```

To assign limits from Python:

```py
requests.post(
    f"{ECHOS}/roles/apply",
    json={
        "agentId": AGENT,
        "template": "research_assistant",
        "overrides": {
            "limits": {
                "ai_daily_usd": 10,
                "ai_monthly_usd": 50,
                "llm_daily_usd": 5
            }
        },
    },
    timeout=5,
)
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
  llm_daily_usd: 5     # Optional tighter cap for language models
  llm_monthly_usd: 50
```

When limits are exceeded, the agent receives a `block` decision and the dashboard highlights the spend guard details.

Set `ai_*` caps to cover the combined spend of every AI intent (chat, image, audio, etc.). Layer optional `llm_*` values on top when you want a tighter budget for LLM traffic only.

### Per-User Spend Caps

For SaaS applications, create users with individual spend limits:

```ts
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
