import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';
import { PlaygroundPanel } from './playground-panel';
import { TimelineProvider } from './timeline-provider';
import { AgentsProvider } from './agents-provider';
import { WorkflowRecorder } from './workflow-recorder';
import { EchosCodeActionProvider, EchosCodeActionCommands } from './code-actions';
import { PolicyEditorPanel } from './policy-editor';
import { TokenManagerPanel } from './token-manager';

let daemonConnection: DaemonConnection;
let statusBarItem: vscode.StatusBarItem;
let workflowRecorder: WorkflowRecorder;

export function activate(context: vscode.ExtensionContext) {
  console.log('Echos extension activating...');

  // Initialize daemon connection
  const config = vscode.workspace.getConfiguration('echos');
  const daemonUrl = config.get<string>('daemonUrl') || 'http://127.0.0.1:3434';
  daemonConnection = new DaemonConnection(daemonUrl);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'echos.openPlayground';
  statusBarItem.text = '$(debug-disconnect) Echos: Disconnected';
  statusBarItem.tooltip = 'Click to open Echos Playground';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Update status bar on connection changes
  daemonConnection.onConnectionChange((connected, stats) => {
    if (connected) {
      statusBarItem.text = `$(debug-start) Echos: ${stats.activeAgents} agents`;
      statusBarItem.tooltip = `Connected to Echos\n${stats.totalEvents} events`;
    } else {
      statusBarItem.text = '$(debug-disconnect) Echos: Disconnected';
      statusBarItem.tooltip = 'Echos daemon not reachable. Click to retry.';
    }
  });

  // Listen for approval requests
  daemonConnection.onApprovalRequest((event) => {
    handleApprovalRequest(event);
  });

  // Initialize tree view providers
  const agentsProvider = new AgentsProvider(daemonConnection);
  const timelineProvider = new TimelineProvider(daemonConnection);

  vscode.window.registerTreeDataProvider('echos.agents', agentsProvider);
  vscode.window.registerTreeDataProvider('echos.timeline', timelineProvider);

  // Initialize workflow recorder
  workflowRecorder = new WorkflowRecorder(context);
  const recorderConfig = vscode.workspace.getConfiguration('echos');
  if (recorderConfig.get<boolean>('enableWorkflowRecorder', true)) {
    workflowRecorder.activate();
    console.log('Echos Workflow Recorder activated');
  }

  // Register Code Action Provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ['typescript', 'javascript', 'python', 'go', 'rust'],
      new EchosCodeActionProvider(),
      {
        providedCodeActionKinds: EchosCodeActionProvider.providedCodeActionKinds
      }
    )
  );

  // Register Code Action Commands
  EchosCodeActionCommands.register(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('echos.openPlayground', () => {
      PlaygroundPanel.createOrShow(context.extensionUri, daemonConnection);
    }),

    vscode.commands.registerCommand('echos.testAction', async () => {
      const intent = await vscode.window.showInputBox({
        prompt: 'Enter intent (e.g., slack.post, email.send)',
        placeHolder: 'slack.post'
      });
      if (!intent) return;

      const target = await vscode.window.showInputBox({
        prompt: 'Enter target (optional)',
        placeHolder: '#general'
      });

      try {
        const result = await daemonConnection.testAction(intent, target || '');
        vscode.window.showInformationMessage(
          `Action ${result.status}: ${intent} → ${target || '(no target)'}`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Test failed: ${err}`);
      }
    }),

    vscode.commands.registerCommand('echos.startDaemon', async () => {
      const terminal = vscode.window.createTerminal('Echos Daemon');
      terminal.sendText('cd $(git rev-parse --show-toplevel) && pnpm dev:daemon');
      terminal.show();
      vscode.window.showInformationMessage('Starting Echos daemon...');
    }),

    vscode.commands.registerCommand('echos.stopDaemon', () => {
      vscode.window.showWarningMessage(
        'Stop daemon by closing its terminal or pressing Ctrl+C'
      );
    }),

    vscode.commands.registerCommand('echos.viewTimeline', () => {
      vscode.commands.executeCommand('echos.timeline.focus');
    }),

    vscode.commands.registerCommand('echos.newAgent', async () => {
      const templates = await daemonConnection.listTemplates();
      const template = await vscode.window.showQuickPick(
        templates.map(t => ({ label: t.name, description: t.description, value: t.name })),
        { placeHolder: 'Select agent template' }
      );
      if (!template) return;

      const agentName = await vscode.window.showInputBox({
        prompt: 'Enter agent name',
        placeHolder: 'my_agent'
      });
      if (!agentName) return;

      const code = generateAgentCode(agentName, template.value);
      const doc = await vscode.workspace.openTextDocument({
        content: code,
        language: 'typescript'
      });
      vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('echos.editPolicy', () => {
      PolicyEditorPanel.createOrShow(context.extensionUri, daemonConnection);
    }),

    vscode.commands.registerCommand('echos.manageTokens', () => {
      TokenManagerPanel.createOrShow(context.extensionUri, daemonConnection);
    }),

    vscode.commands.registerCommand('echos.viewPatterns', async () => {
      vscode.window.showInformationMessage(
        'Workflow patterns are being detected in the background. You\'ll see suggestions when patterns are found!'
      );
    })
  );

  // Auto-connect if enabled
  if (config.get<boolean>('autoConnect')) {
    daemonConnection.connect();
  }

  console.log('Echos extension activated');
}

async function handleApprovalRequest(event: any) {
  const config = vscode.workspace.getConfiguration('echos');
  if (!config.get<boolean>('showInlineApprovals')) return;

  const { id, intent, target, agent, meta } = event.event;
  const message = `Agent "${agent}" requesting approval: ${intent}${target ? ` → ${target}` : ''}`;

  const choice = await vscode.window.showInformationMessage(
    message,
    { modal: false },
    'Approve Once',
    'Grant 1 Hour',
    'Deny',
    'Details'
  );

  if (!choice) return;

  if (choice === 'Details') {
    const detail = JSON.stringify({ intent, target, agent, meta }, null, 2);
    const doc = await vscode.workspace.openTextDocument({
      content: detail,
      language: 'json'
    });
    await vscode.window.showTextDocument(doc);
    // Show the approval prompt again
    return handleApprovalRequest(event);
  }

  if (choice === 'Deny') {
    await daemonConnection.respondToApproval(id, 'block');
    vscode.window.showInformationMessage('Action denied');
  } else if (choice === 'Approve Once') {
    await daemonConnection.respondToApproval(id, 'allow');
    vscode.window.showInformationMessage('Action approved');
  } else if (choice === 'Grant 1 Hour') {
    await daemonConnection.respondToApproval(id, 'allow', {
      scopes: [intent],
      durationSec: 3600,
      reason: 'Approved from VSCode'
    });
    vscode.window.showInformationMessage('Granted 1 hour access');
  }
}

function generateAgentCode(agentName: string, template: string): string {
  return `import { echos } from "@echoshq/sdk";

const agent = echos("${agentName}");

async function main() {
  // Apply policy template
  await agent.applyRole({ template: "${template}" });
  
  // Your agent code here
  // Example:
  // await agent.emit("slack.post", "#general", { text: "Hello!" });
  
  console.log("Agent ${agentName} running...");
}

main().catch(console.error);
`;
}

export function deactivate() {
  if (daemonConnection) {
    daemonConnection.disconnect();
  }
  if (workflowRecorder) {
    workflowRecorder.dispose();
  }
}

