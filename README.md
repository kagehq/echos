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

### Chaos Engineering

Test your agent's resilience with probabilistic fault injection:

```ts
// Development: 20% random failures to test error handling
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.2,      // Block 20% of requests randomly
      latency_ms: 0         // No artificial latency
    }
  }
});

// Production: Controlled 5% fault injection
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.05,     // Block 5% of requests
      target_intents: ['llm.chat', 'http.request:GET*'],
      exempt_intents: ['http.request:GET*/health*']
    }
  }
});

// Get chaos metrics
const metrics = await agent.getChaosMetrics();
console.log(`Chaos injection rate: ${metrics.chaosInjectionRate}`);
console.log(`Total blocked by chaos: ${metrics.stats.chaosTriggered}`);
```

**Use cases:**
- Test agent retry logic and error handling
- Validate graceful degradation under failures
- Production chaos engineering (Netflix Chaos Monkey style)
- Stress testing with reproducible failures (use `seed`)
- Latency testing to simulate slow networks

### Python

```py
import requests

headers = {"Authorization": f"Bearer {os.getenv('ECHOS_API_KEY')}"}
event = {"agent": "my-agent", "intent": "slack.post", "target": "#general"}

resp = requests.post("http://127.0.0.1:3434/decide", json=event, headers=headers).json()
if resp["status"] != "allow":
    raise PermissionError("Action blocked")
```

## Framework Integrations

Echos works as a **governance layer** for any agent framework. Just wrap your tools:

**LangChain.js:**
```ts
import { DynamicTool } from "@langchain/core/tools";
import { echos } from "@echoshq/sdk";

const agent = echos("langchain-agent");

const sendEmailTool = new DynamicTool({
  name: "send_email",
  func: async (input) => {
    // Governance check before execution
    await agent.emit("email.send", input.to);
    return sendEmail(input);
  }
});
```

**Vercel AI SDK:**
```ts
import { tool } from 'ai';
import { echos } from '@echoshq/sdk';

const agent = echos('vercel-agent');

const sendEmailTool = tool({
  execute: async ({ to, body }) => {
    await agent.emit('email.send', to);
    return sendEmail(to, body);
  }
});
```

**Custom Frameworks:**
```ts
// Works with ANY agent framework - just wrap your tools
async function governedTool(action: string, target: string) {
  await agent.emit(action, target);
  return yourExistingTool(action, target);
}
```

**See integration examples**: [`langchain-integration.ts`](examples/langchain-integration.ts), [`vercel-ai-sdk.ts`](examples/vercel-ai-sdk.ts), [`custom-agent-framework.ts`](examples/custom-agent-framework.ts)

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
- **Chaos Engineering** - Probabilistic fault injection for testing agent resilience
- **Real-time Dashboard** - Live event feed and analytics
- **Multi-Tenant** - API keys with per-org data isolation
- **Developer Tools** - Policy testing and validation

## Documentation

- **[Self-Hosting Guide](SELFHOSTING.md)** - Deploy to production (Docker, VPS, cloud platforms)
- **[Examples](examples/)** - Complete agent implementations
- **[Supabase Setup](supabase/README.md)** - Database configuration

## License

FSL-1.1-MIT License. See LICENSE file for details.
