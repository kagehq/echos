# Echos Example Recipes

This directory contains example agent scripts demonstrating Echos in action.

## Available Examples

### 🚀 Basic Usage (`basic-usage.ts`) **← START HERE**
Simple introduction to Echos SDK showing core concepts and basic actions.

**Scopes used**: `llm.chat`, `http.request`, `slack.post`, `fs.delete`, `email.send`

```bash
tsx examples/basic-usage.ts
```

### 🎭 Roles & Templates (`roles-templates.ts`)
Demonstrates the roles and templates system for managing agent policies programmatically.

**Features**: Template listing, role application, policy inspection, role assignments

```bash
tsx examples/roles-templates.ts
```

### 🛡️ Input Filtering (`input-filtering.ts`)
Demonstrates content sanitization and PII detection to prevent sensitive data from entering agent conversations.

**Features**: PII detection, content classification, injection prevention, DSR compliance

```bash
tsx examples/input-filtering.ts
```

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

---

## Framework Integrations

### 🔗 LangChain.js Integration (`langchain-integration.ts`)
Shows how to add Echos governance to LangChain.js agents and tools.

**Features**: Tool wrapping, policy enforcement, LLM agent governance

```bash
npm install langchain @langchain/openai @langchain/core
tsx examples/langchain-integration.ts
```

### ⚡ Vercel AI SDK (`vercel-ai-sdk.ts`)
Demonstrates Echos integration with Vercel AI SDK's tool system.

**Features**: Tool governance, streaming support, multi-step workflows

```bash
npm install ai @ai-sdk/openai zod
tsx examples/vercel-ai-sdk.ts
```

### 🛠️ Custom Framework Patterns (`custom-agent-framework.ts`)
Four reusable patterns for integrating Echos with ANY agent framework.

**Patterns**:
- **Governed Tools**: Explicit wrapper functions
- **Decorator Pattern**: TypeScript decorators for clean governance
- **Middleware Pattern**: Action-based governance
- **Proxy Pattern**: Zero-code-change automatic governance

```bash
tsx examples/custom-agent-framework.ts
```

**Use these patterns to integrate Echos with**:
- LangGraph, AutoGPT, Semantic Kernel
- Custom agent frameworks
- Any tool-calling system
- Third-party agent libraries

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

1. **Start the development stack**:
   ```bash
   pnpm run dev:stack
   ```

2. **Create an API key**:
   - Visit `http://localhost:3000/settings`
   - Click "Create New Key"
   - Set `ECHOS_API_KEY` environment variable

3. **Run an example**:
   ```bash
   export ECHOS_API_KEY=your-api-key-here
   tsx examples/basic-usage.ts
   ```

4. **Watch the dashboard** at `http://localhost:3000` to see events in real-time!

**🆕 NEW: Use the VSCode Extension!**

Test and control agents directly in your editor:
- Press `F5` to launch the extension
- Open Command Palette: `Cmd+Shift+P`
- Run: `Echos: Open Action Playground`
- Test actions interactively without writing code!

[Learn more →](../apps/vscode-extension/QUICKSTART.md)

## Building Your Own Agent

```typescript
import { echos } from "@echoshq/sdk";

// Create agent with API key authentication
const agent = echos("MyAgent", {
  headers: {
    'Authorization': `Bearer ${process.env.ECHOS_API_KEY}`
  }
});

// Option 1: Apply a policy template (recommended)
await agent.applyRole({ 
  template: "research_assistant",
  overrides: { allow: ["calendar.write:*"] }
});

// Option 2: Request authorization upfront (for long-running agents)
await agent.authorize({
  scopes: ["slack.post", "llm.chat"],
  durationSec: 3600,  // 1 hour
  reason: "Daily notifications"
});

// Option 3: Emit actions and handle consent inline
try {
  await agent.emit("slack.post", "#general", {
    text: "Hello from MyAgent!"
  });
} catch (err) {
  console.error("Action denied:", err);
}
```

**Get your API key:** Visit `http://localhost:3000/settings` → Create New Key

## Tips

- **Use policy templates** for consistent agent behavior - apply roles programmatically
- **Create custom templates** in `apps/daemon/templates/` for your specific use cases
- **Start with `.authorize()`** for agents that need multiple scopes
- **Use short durations** (1-2 hours) for security
- **Provide clear reasons** so humans understand why you need access
- **Handle errors gracefully** - actions can be denied or time out
- **Check the Roles page** at `http://localhost:3000/roles` to see applied policies
- **Test locally** before deploying - all data stays on your machine!

## Learn More

- [Main README](../README.md)
- [SDK Documentation](../packages/sdk/README.md)
- [Dashboard Guide](../apps/dashboard/README.md)

