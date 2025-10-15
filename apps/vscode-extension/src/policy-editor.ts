import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';

export class PolicyEditorPanel {
  public static currentPanel: PolicyEditorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    daemonConnection: DaemonConnection,
    agentId?: string
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (PolicyEditorPanel.currentPanel) {
      PolicyEditorPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'echosPolicyEditor',
      'Echos Policy Editor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    PolicyEditorPanel.currentPanel = new PolicyEditorPanel(
      panel,
      extensionUri,
      daemonConnection,
      agentId
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private daemonConnection: DaemonConnection,
    private agentId?: string
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Load current policy
    this.loadPolicy();

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'savePolicy':
            await this.savePolicy(message.policy);
            break;
          case 'testPolicy':
            await this.testPolicy(message.intent, message.target);
            break;
          case 'validateYaml':
            await this.validateYaml(message.yaml);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async loadPolicy() {
    try {
      const policy = await this.daemonConnection.getPolicy(this.agentId);
      this._panel.webview.postMessage({
        command: 'policyLoaded',
        policy
      });
    } catch (err) {
      vscode.window.showErrorMessage('Failed to load policy');
    }
  }

  private async savePolicy(policy: any) {
    try {
      // Apply the policy via daemon
      await this.daemonConnection.applyPolicy(this.agentId || 'default', policy);
      vscode.window.showInformationMessage('Policy saved successfully!');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to save policy: ${err}`);
    }
  }

  private async testPolicy(intent: string, target: string) {
    try {
      const result = await this.daemonConnection.testAction(intent, target);
      this._panel.webview.postMessage({
        command: 'testResult',
        result
      });
    } catch (err) {
      vscode.window.showErrorMessage(`Test failed: ${err}`);
    }
  }

  private async validateYaml(yaml: string) {
    try {
      const result = await this.daemonConnection.validateYaml(yaml);
      this._panel.webview.postMessage({
        command: 'validationResult',
        result
      });
    } catch (err) {
      this._panel.webview.postMessage({
        command: 'validationResult',
        result: { valid: false, errors: [String(err)] }
      });
    }
  }

  private _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Policy Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { 
      font-size: 24px; 
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
    }
    .section {
      margin-bottom: 24px;
      padding: 16px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
    }
    .section h2 {
      font-size: 18px;
      margin-bottom: 12px;
    }
    textarea {
      width: 100%;
      min-height: 120px;
      padding: 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      resize: vertical;
    }
    .pattern-list {
      margin-top: 8px;
    }
    .pattern-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .pattern-item input {
      flex: 1;
      padding: 6px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-family: var(--vscode-editor-font-family);
    }
    .pattern-item button {
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      margin-right: 8px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .test-area {
      display: flex;
      gap: 12px;
      margin-top: 12px;
    }
    .test-area input {
      flex: 1;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
    }
    .result {
      margin-top: 12px;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }
    .result.success {
      border-color: var(--vscode-testing-iconPassed);
      background: rgba(0, 200, 83, 0.1);
    }
    .result.error {
      border-color: var(--vscode-testing-iconFailed);
      background: rgba(229, 83, 75, 0.1);
    }
    .button-group {
      margin-top: 16px;
    }
    .hint {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🛡️ Policy Editor</h1>
    <p class="subtitle">Define what actions your agent can take</p>

    <div class="section">
      <h2>Allow Rules</h2>
      <p class="hint">Actions that are automatically approved</p>
      <div class="pattern-list" id="allowList"></div>
      <button onclick="addPattern('allow')" class="secondary">+ Add Pattern</button>
    </div>

    <div class="section">
      <h2>Ask Rules</h2>
      <p class="hint">Actions that require human approval</p>
      <div class="pattern-list" id="askList"></div>
      <button onclick="addPattern('ask')" class="secondary">+ Add Pattern</button>
    </div>

    <div class="section">
      <h2>Block Rules</h2>
      <p class="hint">Actions that are always denied</p>
      <div class="pattern-list" id="blockList"></div>
      <button onclick="addPattern('block')" class="secondary">+ Add Pattern</button>
    </div>

    <div class="section">
      <h2>Test Policy</h2>
      <p class="hint">Test how your policy handles specific actions</p>
      <div class="test-area">
        <input type="text" id="testIntent" placeholder="Intent (e.g., slack.post)" />
        <input type="text" id="testTarget" placeholder="Target (e.g., #general)" />
        <button onclick="testPolicy()">Test</button>
      </div>
      <div id="testResult"></div>
    </div>

    <div class="button-group">
      <button onclick="savePolicy()">💾 Save Policy</button>
      <button onclick="exportYaml()" class="secondary">📄 Export YAML</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentPolicy = { allow: [], ask: [], block: [] };

    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.command === 'policyLoaded') {
        currentPolicy = message.policy;
        renderPolicy();
      } else if (message.command === 'testResult') {
        displayTestResult(message.result);
      } else if (message.command === 'validationResult') {
        displayValidation(message.result);
      }
    });

    function renderPolicy() {
      renderPatternList('allow', currentPolicy.allow || []);
      renderPatternList('ask', currentPolicy.ask || []);
      renderPatternList('block', currentPolicy.block || []);
    }

    function renderPatternList(type, patterns) {
      const list = document.getElementById(type + 'List');
      list.innerHTML = '';
      
      patterns.forEach((pattern, idx) => {
        const item = document.createElement('div');
        item.className = 'pattern-item';
        item.innerHTML = \`
          <input type="text" value="\${pattern}" onchange="updatePattern('\${type}', \${idx}, this.value)" />
          <button onclick="removePattern('\${type}', \${idx})">✕</button>
        \`;
        list.appendChild(item);
      });
    }

    function addPattern(type) {
      if (!currentPolicy[type]) currentPolicy[type] = [];
      currentPolicy[type].push('');
      renderPolicy();
    }

    function removePattern(type, idx) {
      currentPolicy[type].splice(idx, 1);
      renderPolicy();
    }

    function updatePattern(type, idx, value) {
      currentPolicy[type][idx] = value;
    }

    function savePolicy() {
      vscode.postMessage({
        command: 'savePolicy',
        policy: currentPolicy
      });
    }

    function testPolicy() {
      const intent = document.getElementById('testIntent').value;
      const target = document.getElementById('testTarget').value;
      
      if (!intent) {
        alert('Please enter an intent');
        return;
      }
      
      vscode.postMessage({
        command: 'testPolicy',
        intent,
        target
      });
    }

    function displayTestResult(result) {
      const div = document.getElementById('testResult');
      const statusClass = result.status === 'allow' ? 'success' : 'error';
      
      div.innerHTML = \`
        <div class="result \${statusClass}">
          <strong>Result: \${result.status.toUpperCase()}</strong>
          \${result.rule ? \`<div>Rule: <code>\${result.rule}</code></div>\` : ''}
          \${result.source ? \`<div>Source: \${result.source}</div>\` : ''}
        </div>
      \`;
    }

    function exportYaml() {
      const yaml = \`name: "Custom Policy"
allow:
\${currentPolicy.allow.map(p => \`  - "\${p}"\`).join('\\n')}

ask:
\${currentPolicy.ask.map(p => \`  - "\${p}"\`).join('\\n')}

block:
\${currentPolicy.block.map(p => \`  - "\${p}"\`).join('\\n')}
\`;
      
      navigator.clipboard.writeText(yaml);
      alert('YAML copied to clipboard!');
    }

    // Initial render
    renderPolicy();
  </script>
</body>
</html>`;
  }

  dispose() {
    PolicyEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

