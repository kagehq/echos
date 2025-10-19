# @echoshq/sdk

SDK for Echos - A firewall for AI agents to observe and control every action your agents take in real time.

Unlike passive monitoring tools, Echos intercepts actions *before* they happen, giving you policy-based control and human approval for sensitive operations.


## Installation

```bash
npm install @echoshq/sdk
```

or

```bash
pnpm add @echoshq/sdk
```

## Quick Start

```typescript
import { echos } from "@echoshq/sdk";

// Create an agent instance with API key
const agent = echos("my_agent", {
  headers: {
    'Authorization': `Bearer ${process.env.ECHOS_API_KEY}`
  }
});

// Emit actions (checked against policy)
await agent.emit("slack.post", "#general", { text: "Deploy complete!" });
```

**Get your API key:** Sign up at `http://localhost:3000/signup`, then go to Settings to create a key.

## Features

- **Policy-Based Control** - Allow, ask, or block actions based on regex patterns
- **Human-in-the-Loop** - Request consent for sensitive actions via dashboard
- **Token Management** - Request time-limited authorizations for repeated actions
- **Event Debugging** - Attach request/response/metadata to every action
- **Real-time Monitoring** - Live feed of all agent activities in the dashboard

## API

### `echos(agentName: string, options?: { headers?: Record<string, string> })`

Create an agent instance with API key authentication.

```typescript
const agent = echos("my_agent", {
  headers: {
    'Authorization': `Bearer ${process.env.ECHOS_API_KEY}`
  }
});
```

### `agent.emit(intent, target?, meta?, request?, response?, metadata?)`

Emit an action to be checked against policy.

**Parameters:**
- `intent` (string) - Action type (e.g., "slack.post", "http.request")
- `target` (string, optional) - Action target (e.g., URL, channel name)
- `meta` (any, optional) - Action metadata
- `request` (any, optional) - Request data for debugging
- `response` (any, optional) - Response data for debugging
- `metadata` (any, optional) - Additional metadata for debugging

**Returns:** Promise that resolves if action is allowed, rejects if blocked or denied.

**Examples:**

```typescript
// Simple action
await agent.emit("llm.chat", "gpt-4", { prompt: "Hello" });

// With debugging details
await agent.emit(
  "http.request",
  "https://api.example.com",
  { method: "GET" },
  { url: "https://api.example.com", headers: { ... } },  // request
  { status: 200, data: { ... } },                        // response
  { latency: "142ms", retries: 0 }                       // metadata
);

// File operation
await agent.emit("fs.write", "/data/output.json", { content: data });
```

### `agent.authorize(options)`

Request a time-limited token for repeated actions.

**Parameters:**
- `scopes` (string[]) - List of intents to authorize
- `durationSec` (number) - Token lifetime in seconds
- `reason` (string, optional) - Explanation for the user

**Returns:** Promise that resolves if authorization granted.

**Example:**

```typescript
await agent.authorize({
  scopes: ["slack.post", "email.send"],
  durationSec: 3600, // 1 hour
  reason: "Deploy notifications"
});

// Now these actions won't require approval for 1 hour
await agent.emit("slack.post", "#deploys", { text: "Starting..." });
await agent.emit("slack.post", "#deploys", { text: "Complete!" });
```

## Available Scopes

- `llm.chat` - LLM API calls
- `http.request` - HTTP requests
- `email.send` / `email.read` - Email operations
- `slack.post` / `slack.read` - Slack messages
- `calendar.read` / `calendar.write` - Calendar events
- `fs.read` / `fs.write` / `fs.delete` - File operations

## Policy Configuration

Configure policies in `~/.echos/echos.yaml`:

```yaml
allow:
  - "llm.chat:.*"        # Auto-allow LLM calls

ask:
  - "slack.post:.*"      # Require consent
  - "email.send:.*"
  - "calendar.*:.*"

block:
  - "fs\\.delete:.*"     # Always block
```

## Error Handling

```typescript
try {
  await agent.emit("fs.delete", "/critical/data.json");
} catch (err) {
  if (err.message.includes("blocked")) {
    console.log("Action blocked by policy");
  } else if (err.message.includes("denied")) {
    console.log("User denied the action");
  } else {
    console.log("Daemon unreachable, failing open");
  }
}
```

## Dashboard

Start the Echos daemon and dashboard to monitor and control your agents:

```bash
# Terminal 1
pnpm dev:daemon

# Terminal 2  
pnpm dev:dashboard

# Terminal 3
node your-agent.js
```

Then visit `http://localhost:3000` to:
- View real-time feed of agent actions
- Approve/deny consent requests
- View historical timeline
- Manage authorization tokens
- See performance metrics

## Environment Variables

- `ECHOS_PORT` - Daemon HTTP port (default: 3434)
- `ECHOS_HOST` - Daemon bind address (default: 127.0.0.1)
- `ECHOS_SECRET` - JWT secret key (auto-generated)
- `ECHOS_LOCAL_ONLY` - Disable network access (optional)

## More

- **[Echos Repository](https://github.com/kagehq/echos)** - Full documentation and examples

## License

FSL-1.1-MIT License - See [LICENSE](https://github.com/kagehq/echos/blob/main/LICENSE) for details.

