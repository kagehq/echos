# 🚀 Echos - Quick Start Guide

## What is Echos?

Echos is a local developer tool that lets you **visualize and control** AI agent actions in real-time. Think of it as a permission system and monitoring dashboard for your autonomous agents.

## 🎯 5-Minute Setup

### 1. Run the Demo

Open a terminal in this directory and run:

```bash
npx @echos/demo
```

**What happens:**
1. Daemon starts on `http://127.0.0.1:3434`
2. Dashboard starts on `http://localhost:3000`
3. Browser opens automatically to the dashboard
4. Demo agent runs 3 actions:
   - ✅ **LLM chat** → Auto-allowed (green in feed)
   - ⚠️  **Slack post** → Asks permission (modal pops up!)
   - ❌ **File delete** → Auto-blocked (red, throws error)

### 3. Interact with the Dashboard

When the consent modal appears:
- Click **"Allow once"** to let the action proceed
- Click **"Deny"** to block it

Watch the live feed update in real-time!

## 📖 Use in Your Code

### Install (for your projects)

```bash
npm install @echos/sdk
# or
pnpm add @echos/sdk
```

### Basic Usage

```typescript
import { echos } from "@echos/sdk";

// Create a client
const agent = echos("my_agent_name");

// Emit actions - they'll be checked against policy
await agent.emit("llm.chat", "openai.chat", { 
  prompt: "Analyze this data" 
});

await agent.emit("slack.post", "#general", { 
  text: "Task completed!" 
});

await agent.emit("email.send", "team@company.com", {
  subject: "Weekly Report",
  body: "Here's the summary..."
});
```

If an action is blocked, it throws an error:
```typescript
try {
  await agent.emit("fs.delete", "/important/data.json");
} catch (err) {
  console.log("Action blocked:", err.message);
}
```

## ⚙️ Configure Policies

Edit `~/.echos/echos.yaml` to control what actions are allowed:

```yaml
allow:
  - "llm.chat:.*"              # Auto-allow all LLM calls

ask:
  - "slack.post:.*"            # Ask before Slack posts
  - "email.send:.*"            # Ask before emails

block:
  - "fs\\.delete:.*"           # Block all file deletions
```

**Pro tip:** Changes apply immediately without restarting!

## 🛠️ Development Mode

Run services separately for development:

**Terminal 1 - Start Daemon:**
```bash
pnpm dev:daemon
```

**Terminal 2 - Start Dashboard:**
```bash
pnpm dev:dashboard
```

**Terminal 3 - Run Your Agent:**
```typescript
// your-agent.ts
import { echos } from "@echos/sdk";

const agent = echos("test_bot");
await agent.emit("llm.chat", "gpt-4", { prompt: "hello" });
```

Then run: `tsx your-agent.ts`

## 🎨 Dashboard Features

Open `http://localhost:3000` to see:

- **Live Feed** - Real-time stream of all agent actions
- **Consent Modals** - Interactive permission requests
- **Color-coded Events:**
  - 🟢 Green = allowed
  - 🟡 Amber = asking permission
  - 🔵 Cyan = decision made
  - ⚪ White = metadata

## 📝 Action Types

Echos supports these action types out of the box:

1. **`llm.chat`** - AI model API calls
2. **`http.request`** - HTTP requests to external APIs
3. **`email.send`** - Email sending
4. **`slack.post`** - Slack messages
5. **`fs.delete`** - File system deletions

Add more in `packages/sdk/src/types.ts`!



## 📚 Available Scripts

```bash
pnpm demo              # Run full demo (recommended!)
pnpm dev:daemon        # Start daemon only
pnpm dev:dashboard     # Start dashboard only
pnpm build:all         # Rebuild SDK + CLI
```

## 🎯 Next Steps

1. ✅ Run `npx @echos/demo` to see it in action
2. ✅ Edit `~/.echos/echos.yaml` to customize policies
3. ✅ Check `examples/basic-usage.ts` for code samples
4. ✅ Read `README.md` for detailed documentation
5. ✅ Integrate SDK into your AI agent projects