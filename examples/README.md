# Echos Example Recipes

This directory contains example agent scripts demonstrating Echos in action.

## Available Examples

### 🤖 RecruitBot (`recruit-bot.ts`)
Automated candidate outreach with email drafting and calendar scheduling.

**Scopes used**: `email.send`, `calendar.read`, `calendar.write`

```bash
tsx examples/recruit-bot.ts
```

### 📊 SalesBot (`sales-bot.ts`)
Deal monitoring with Slack notifications and LLM-drafted follow-ups.

**Scopes used**: `slack.post`, `llm.chat`

```bash
tsx examples/sales-bot.ts
```

### 🔍 CodeReviewer (`code-reviewer.ts`)
Automated PR review with GitHub API integration and email summaries.

**Scopes used**: `http.request`, `llm.chat`, `slack.post`, `email.send`

```bash
tsx examples/code-reviewer.ts
```

## Scope Taxonomy

Echos uses a **fixed set of official scopes** to ensure consistency across agents. Always use these exact scope names:

| Scope | Description |
|-------|-------------|
| `llm.chat` | Chat with LLM services (OpenAI, Claude, etc.) |
| `email.send` | Send emails |
| `email.read` | Read emails |
| `calendar.read` | Read calendar events |
| `calendar.write` | Create/modify calendar events |
| `slack.post` | Post to Slack channels |
| `slack.read` | Read Slack messages |
| `fs.read` | Read files |
| `fs.write` | Write files |
| `fs.delete` | Delete files |
| `http.request` | Make HTTP requests |

**Query available scopes from the daemon**:
```bash
curl http://127.0.0.1:3434/scopes | jq
```

## Quick Start

1. **Start the daemon and dashboard**:
   ```bash
   pnpm dev:daemon  # Terminal 1
   pnpm dev:dashboard  # Terminal 2
   ```

2. **Run an example**:
   ```bash
   tsx examples/sales-bot.ts
   ```

3. **Watch the dashboard** at `http://localhost:3000` to approve actions!

## Building Your Own Agent

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("MyAgent");

// Option 1: Request authorization upfront (recommended for long-running agents)
await agent.authorize({
  scopes: ["slack.post", "llm.chat"],
  durationSec: 3600,  // 1 hour
  reason: "Daily notifications"
});

// Option 2: Emit actions and handle consent inline
try {
  await agent.emit("slack.post", "#general", {
    text: "Hello from MyAgent!"
  });
} catch (err) {
  console.error("Action denied:", err);
}

// Option 3: Use the fetch wrapper for HTTP requests
const response = await agent.fetch("https://api.example.com/data");
```

## Tips

- **Start with `.authorize()`** for agents that need multiple scopes
- **Use short durations** (1-2 hours) for security
- **Provide clear reasons** so humans understand why you need access
- **Handle errors gracefully** - actions can be denied or time out
- **Test locally** before deploying - all data stays on your machine!

## Learn More

- [Main README](../README.md)
- [SDK Documentation](../packages/sdk/README.md)
- [Dashboard Guide](../apps/dashboard/README.md)

