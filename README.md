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

**Local Development:**

```bash
git clone https://github.com/kagehq/echos.git
cd echos
pnpm install

# Interactive setup (configures Supabase)
pnpm run setup

# Start dashboard + daemon
pnpm run dev:stack
```

Visit `http://localhost:3000` → Sign up → Create API key in Settings

**Self-Hosting / Production:** See [SELFHOSTING.md](SELFHOSTING.md) for deployment guides.

## Usage

```bash
npm install @echoshq/sdk
```

```ts
import { echos } from '@echoshq/sdk';

const agent = echos('my_agent', {
  headers: { 'Authorization': `Bearer ${process.env.ECHOS_API_KEY}` }
});

await agent.emit('slack.post', '#general', { text: 'Hello!' });
```

### Automatic Input Filtering

PII and sensitive data are automatically redacted:

```ts
// Your code
await agent.emit('slack.post', '#general', { 
  text: 'Contact john@company.com at 555-123-4567' 
});

// What actually gets posted (PII automatically redacted)
// "Contact [EMAIL_REDACTED] at [PHONE_REDACTED]"
```

### With Spend Limits

```ts
await agent.applyRole({
  template: 'research_assistant',
  overrides: { limits: { ai_daily_usd: 10 } }
});

await agent.emit('llm.chat', 'gpt-4o', { prompt }, undefined, undefined, { costUsd: 0.01 });
```

### Python

```py
import requests

headers = {"Authorization": f"Bearer {os.getenv('ECHOS_API_KEY')}"}
event = {"agent": "my-agent", "intent": "slack.post", "target": "#general"}

resp = requests.post("http://127.0.0.1:3434/decide", json=event, headers=headers).json()
if resp["status"] != "allow":
    raise PermissionError("Action blocked")
```

## Examples

Check out the [`examples/`](examples/) directory for complete agent implementations:

```bash
# Set your API key
export ECHOS_API_KEY=your-key-here

# Run examples
tsx examples/basic-usage.ts       # Core concepts
tsx examples/input-filtering.ts   # PII detection
tsx examples/roles-templates.ts   # Policy management
tsx examples/code-reviewer.ts     # PR automation
tsx examples/sales-bot.ts         # Deal monitoring
```

See [`examples/README.md`](examples/README.md) for full documentation.

## How It Works

1. Agent emits action via SDK
2. Daemon filters input (redacts PII, blocks injection attacks)
3. Daemon checks policy → `allow`, `block`, or `ask`  
4. If `ask`, dashboard shows consent modal
5. Human approves → action proceeds

## Features

- **Policy Engine** - Regex-based allow/ask/block rules
- **Input Filtering** - Automatic PII redaction, injection prevention, and content classification
- **Spend Limits** - Daily/monthly AI cost tracking
- **Real-time Dashboard** - Live event feed and analytics
- **Multi-Tenant** - API keys with per-org data isolation
- **Developer Tools** - Policy testing and validation

## Documentation

- **[Self-Hosting Guide](SELFHOSTING.md)** - Deploy to production (Docker, VPS, cloud platforms)
- **[Examples](examples/)** - Complete agent implementations
- **[Supabase Setup](supabase/README.md)** - Database configuration

## License

FSL-1.1-MIT License. See LICENSE file for details.
