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

[![Discord](https://img.shields.io/badge/Discord-Join%20our%20community-7289DA?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KqdBcqRk5E)

## Quick Start

```bash
git clone https://github.com/kagehq/echos.git
cd echos
pnpm run setup:node
source scripts/env.sh
pnpm install
pnpm build:all
pnpm demo
```

The demo will automatically start both the daemon and dashboard. Visit `http://localhost:3000` to see the dashboard.

### Development

```bash
pnpm dev:stack
```

## Use in Your Project

```bash
npm install @echoshq/sdk
```

```ts
import { echos } from '@echoshq/sdk';

const agent = echos('my_agent');
await agent.emit('slack.post', '#general', { text: 'Hello!' });
```

### With Spend Limits

```ts
const guard = echos('pipeline-123');
await guard.applyRole({
  template: 'research_assistant',
  overrides: { limits: { ai_daily_usd: 10, llm_daily_usd: 5 } }
});

await guard.emit('llm.chat', 'gpt-4o', { prompt }, undefined, undefined, { costUsd: 0.01 });
```

### Input Filtering

```ts
// Test content filtering
const result = await agent.testInputFilter('Contact john@example.com at 555-123-4567', 'strict');
console.log(result.sanitized); // "Contact [EMAIL_REDACTED] at [PHONE_REDACTED]"

// Automatic protection
await agent.emit('llm.chat', 'Analyze: john@example.com, 555-123-4567');
// Agent receives: "Analyze: [EMAIL_REDACTED], [PHONE_REDACTED]"
```

### Python

```py
import requests
from uuid import uuid4

def emit(intent, target=None, metadata=None):
    event = {"agent": "python-agent", "intent": intent, "target": target, "metadata": metadata}
    resp = requests.post("http://127.0.0.1:3434/decide", json=event).json()
    if resp["status"] != "allow":
        raise PermissionError("Action blocked")
    requests.post("http://127.0.0.1:3434/events", json=event)
    return resp

emit("llm.chat", "gpt-4o", {"costUsd": 0.01})
```

## How It Works

1. Agent emits action via SDK
2. Daemon checks policy → `allow`, `block`, or `ask`  
3. If `ask`, dashboard shows consent modal
4. Human approves → action proceeds

## Features

- **Policy Engine** - Regex-based allow/ask/block rules
- **Input Filtering** - PII detection and content sanitization  
- **Spend Limits** - Daily/monthly AI cost controls
- **Real-time Dashboard** - Live event feed and analytics
- **Developer Tools** - Policy testing and template validation

## License

FSL-1.1-MIT License. See LICENSE file for details.
