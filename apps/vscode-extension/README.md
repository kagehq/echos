# Echos for VSCode

Test, monitor, and control AI agents directly in your IDE.

## Features

### 🎯 Action Playground
Test agent actions interactively without writing code:
- Choose intents (slack.post, email.send, etc.)
- See policy decisions in real-time
- Copy generated code to your project

### 🔔 Inline Approvals
Handle agent approval requests without leaving your editor:
- Notification popups for actions requiring consent
- Quick approve/deny/grant access
- See full action details before deciding

### 📊 Activity Timeline
Live feed of all agent events:
- Real-time updates via WebSocket
- Filter by agent, intent, or status
- Click for full event details

### 🤖 Active Agents View
Monitor running agents and their policies:
- See which agents are active
- View applied templates
- Track role assignments

## Quick Start

1. **Install the extension** (coming soon to VSCode Marketplace)

2. **Start Echos daemon** in your project:
   ```bash
   pnpm dev:daemon
   ```

3. **Open the Command Palette** (`Cmd+Shift+P`) and run:
   - `Echos: Open Action Playground`
   - Test an action interactively

4. **Generate agent code**:
   - Use the playground to test actions
   - Click "Copy Code" to get TypeScript code
   - Paste into your project

## Commands

- **Echos: Open Action Playground** - Interactive testing panel
- **Echos: Test Agent Action** - Quick action test via command palette
- **Echos: Start Daemon** - Start Echos daemon in terminal
- **Echos: New Agent from Template** - Generate agent boilerplate
- **Echos: View Activity Timeline** - Show recent events

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `echos.daemonUrl` | `http://127.0.0.1:3434` | Echos daemon URL |
| `echos.autoConnect` | `true` | Auto-connect to daemon on startup |
| `echos.showInlineApprovals` | `true` | Show approval notifications |

## Usage Example

1. Open the Action Playground
2. Select intent: `slack.post`
3. Enter target: `#general`
4. Add metadata: `{ "text": "Hello!" }`
5. Click "Test Action" to see policy decision
6. Click "Copy Code" to get:

```typescript
import { echos } from "@echoshq/sdk";

const agent = echos("playground_test");

await agent.emit("slack.post", "#general", { "text": "Hello!" });
```

## Requirements

- Echos daemon running (from the main Echos project)
- Node.js 18+ (for running agents)

## Extension Views

The extension adds an **Echos** section to your sidebar with:
- **Action Playground** - Interactive testing
- **Active Agents** - List of running agents
- **Recent Activity** - Timeline of events

## Feedback

Found a bug or have a feature request? [Open an issue](https://github.com/kagehq/echos/issues)

## License

FSL-1.1-MIT License - Same as the main Echos project

