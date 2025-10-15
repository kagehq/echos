import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';

export class TokenManagerPanel {
  public static currentPanel: TokenManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private refreshInterval?: NodeJS.Timeout;

  public static createOrShow(
    extensionUri: vscode.Uri,
    daemonConnection: DaemonConnection
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TokenManagerPanel.currentPanel) {
      TokenManagerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'echosTokenManager',
      'Echos Token Manager',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    TokenManagerPanel.currentPanel = new TokenManagerPanel(
      panel,
      extensionUri,
      daemonConnection
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private daemonConnection: DaemonConnection
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Load tokens
    this.loadTokens();

    // Auto-refresh every 5 seconds
    this.refreshInterval = setInterval(() => {
      this.loadTokens();
    }, 5000);

    // Handle messages
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'revokeToken':
            await this.revokeToken(message.token);
            break;
          case 'pauseToken':
            await this.pauseToken(message.token);
            break;
          case 'resumeToken':
            await this.resumeToken(message.token);
            break;
          case 'createToken':
            await this.createToken(message.scopes, message.duration, message.reason);
            break;
          case 'refresh':
            await this.loadTokens();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async loadTokens() {
    try {
      const tokens = await this.daemonConnection.listTokens();
      this._panel.webview.postMessage({
        command: 'tokensLoaded',
        tokens
      });
    } catch (err) {
      console.error('Failed to load tokens:', err);
    }
  }

  private async revokeToken(token: string) {
    try {
      await this.daemonConnection.revokeToken(token);
      vscode.window.showInformationMessage('Token revoked');
      await this.loadTokens();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to revoke token: ${err}`);
    }
  }

  private async pauseToken(token: string) {
    try {
      await this.daemonConnection.pauseToken(token);
      vscode.window.showInformationMessage('Token paused');
      await this.loadTokens();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to pause token: ${err}`);
    }
  }

  private async resumeToken(token: string) {
    try {
      await this.daemonConnection.resumeToken(token);
      vscode.window.showInformationMessage('Token resumed');
      await this.loadTokens();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to resume token: ${err}`);
    }
  }

  private async createToken(scopes: string[], duration: number, reason: string) {
    try {
      await this.daemonConnection.createToken(scopes, duration, reason);
      vscode.window.showInformationMessage('Token created');
      await this.loadTokens();
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create token: ${err}`);
    }
  }

  private _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Token Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { 
      font-size: 24px; 
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
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
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.danger {
      background: var(--vscode-errorForeground);
      color: white;
    }
    .token-card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .token-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 12px;
    }
    .token-agent {
      font-size: 16px;
      font-weight: 600;
    }
    .token-status {
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 500;
    }
    .token-status.active {
      background: rgba(0, 200, 83, 0.2);
      color: var(--vscode-testing-iconPassed);
    }
    .token-status.paused {
      background: rgba(255, 191, 0, 0.2);
      color: var(--vscode-testing-iconQueued);
    }
    .token-status.expired {
      background: rgba(229, 83, 75, 0.2);
      color: var(--vscode-testing-iconFailed);
    }
    .token-info {
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
    }
    .token-scopes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .scope-tag {
      padding: 3px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      font-size: 11px;
    }
    .token-actions {
      display: flex;
      gap: 8px;
    }
    .token-actions button {
      padding: 6px 12px;
      font-size: 12px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state h2 {
      font-size: 18px;
      margin-bottom: 12px;
    }
    .countdown {
      font-weight: 600;
      color: var(--vscode-testing-iconQueued);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>🔑 Token Manager</h1>
        <p class="subtitle">Manage authorization tokens for your agents</p>
      </div>
      <div>
        <button onclick="refresh()" class="secondary">🔄 Refresh</button>
        <button onclick="createToken()">+ New Token</button>
      </div>
    </div>

    <div id="tokenList"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let tokens = [];

    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.command === 'tokensLoaded') {
        tokens = message.tokens || [];
        renderTokens();
      }
    });

    function renderTokens() {
      const list = document.getElementById('tokenList');
      
      if (tokens.length === 0) {
        list.innerHTML = \`
          <div class="empty-state">
            <h2>No Active Tokens</h2>
            <p>Create a token to grant your agents time-limited access</p>
          </div>
        \`;
        return;
      }
      
      list.innerHTML = tokens.map(token => \`
        <div class="token-card">
          <div class="token-header">
            <div class="token-agent">🤖 \${token.agent}</div>
            <div class="token-status \${getStatusClass(token)}">
              \${getStatusText(token)}
            </div>
          </div>
          
          <div class="token-info">
            <div>Expires: \${formatExpiry(token.expiresAt)}</div>
            <div class="countdown">\${getCountdown(token.expiresAt)}</div>
          </div>
          
          <div class="token-scopes">
            \${token.scopes.map(scope => \`<span class="scope-tag">\${scope}</span>\`).join('')}
          </div>
          
          <div class="token-actions">
            \${token.status === 'active' ? \`
              <button onclick="pauseToken('\${token.token}')" class="secondary">⏸ Pause</button>
            \` : ''}
            \${token.status === 'paused' ? \`
              <button onclick="resumeToken('\${token.token}')">▶ Resume</button>
            \` : ''}
            <button onclick="revokeToken('\${token.token}')" class="danger">🗑️ Revoke</button>
          </div>
        </div>
      \`).join('');
    }

    function getStatusClass(token) {
      if (Date.now() >= token.expiresAt) return 'expired';
      return token.status === 'active' ? 'active' : 'paused';
    }

    function getStatusText(token) {
      if (Date.now() >= token.expiresAt) return 'EXPIRED';
      return token.status.toUpperCase();
    }

    function formatExpiry(timestamp) {
      return new Date(timestamp).toLocaleString();
    }

    function getCountdown(expiresAt) {
      const diff = expiresAt - Date.now();
      if (diff <= 0) return 'Expired';
      
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      
      if (hours > 0) return \`\${hours}h \${minutes}m remaining\`;
      if (minutes > 0) return \`\${minutes}m \${seconds}s remaining\`;
      return \`\${seconds}s remaining\`;
    }

    function revokeToken(token) {
      if (confirm('Are you sure you want to revoke this token?')) {
        vscode.postMessage({ command: 'revokeToken', token });
      }
    }

    function pauseToken(token) {
      vscode.postMessage({ command: 'pauseToken', token });
    }

    function resumeToken(token) {
      vscode.postMessage({ command: 'resumeToken', token });
    }

    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }

    function createToken() {
      // This would open a form - simplified for now
      alert('Use Command Palette: "Echos: Create Token" for now');
    }

    // Auto-update countdowns
    setInterval(() => {
      if (tokens.length > 0) {
        renderTokens();
      }
    }, 1000);
  </script>
</body>
</html>`;
  }

  dispose() {
    TokenManagerPanel.currentPanel = undefined;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

