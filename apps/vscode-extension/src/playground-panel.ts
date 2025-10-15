import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';

export class PlaygroundPanel {
  public static currentPanel: PlaygroundPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    daemonConnection: DaemonConnection
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (PlaygroundPanel.currentPanel) {
      PlaygroundPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'echosPlayground',
      'Echos Playground',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    PlaygroundPanel.currentPanel = new PlaygroundPanel(
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

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'testAction':
            await this.handleTestAction(message);
            break;
          case 'copyCode':
            await this.handleCopyCode(message);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async handleTestAction(message: any) {
    const { agent, intent, target, meta } = message;
    
    try {
      const result = await this.daemonConnection.testAction(intent, target);
      
      this._panel.webview.postMessage({
        command: 'testResult',
        result: {
          status: result.status,
          rule: result.rule,
          source: result.source,
          message: result.message,
          signature: result.signature
        }
      });
    } catch (err) {
      this._panel.webview.postMessage({
        command: 'testResult',
        result: {
          status: 'error',
          message: String(err)
        }
      });
    }
  }

  private async handleCopyCode(message: any) {
    const { agent, intent, target, meta } = message;
    
    const code = `import { echos } from "@echoshq/sdk";

const agent = echos("${agent}");

await agent.emit("${intent}", ${target ? `"${target}"` : 'undefined'}, ${JSON.stringify(meta, null, 2)});
`;

    await vscode.env.clipboard.writeText(code);
    vscode.window.showInformationMessage('Code copied to clipboard!');
  }

  private _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Echos Playground</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { 
      font-size: 24px; 
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }
    input, select, textarea {
      width: 100%;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    input:focus, select:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    textarea {
      font-family: var(--vscode-editor-font-family);
      resize: vertical;
      min-height: 80px;
    }
    .button-group {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: var(--vscode-font-size);
      font-weight: 500;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .result {
      margin-top: 24px;
      padding: 16px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }
    .result.success {
      border-color: var(--vscode-testing-iconPassed);
      background: rgba(0, 200, 83, 0.1);
    }
    .result.error {
      border-color: var(--vscode-testing-iconFailed);
      background: rgba(229, 83, 75, 0.1);
    }
    .result.ask {
      border-color: var(--vscode-testing-iconQueued);
      background: rgba(255, 191, 0, 0.1);
    }
    .result-status {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .result-detail {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .hint {
      margin-top: 8px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    .code-block {
      margin-top: 12px;
      padding: 12px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Action Playground</h1>
    <p class="subtitle">Test agent actions without writing code</p>

    <form id="testForm">
      <div class="form-group">
        <label for="agent">Agent Name</label>
        <input type="text" id="agent" value="playground_test" placeholder="my_agent">
        <div class="hint">The agent identifier (can be anything for testing)</div>
      </div>

      <div class="form-group">
        <label for="intent">Intent</label>
        <select id="intent">
          <option value="slack.post">slack.post</option>
          <option value="email.send">email.send</option>
          <option value="llm.chat">llm.chat</option>
          <option value="http.request">http.request</option>
          <option value="fs.write">fs.write</option>
          <option value="fs.delete">fs.delete</option>
          <option value="calendar.write">calendar.write</option>
        </select>
        <div class="hint">The action type to test</div>
      </div>

      <div class="form-group">
        <label for="target">Target (optional)</label>
        <input type="text" id="target" placeholder="#general, user@example.com, /path/file.txt">
        <div class="hint">Where the action is directed (channel, email, URL, etc.)</div>
      </div>

      <div class="form-group">
        <label for="meta">Metadata (JSON, optional)</label>
        <textarea id="meta" placeholder='{ "text": "Hello!" }'>{ "text": "Hello from playground!" }</textarea>
        <div class="hint">Additional data for the action</div>
      </div>

      <div class="button-group">
        <button type="submit">▶ Test Action</button>
        <button type="button" class="secondary" id="copyBtn">📋 Copy Code</button>
      </div>
    </form>

    <div id="result" style="display: none;"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('testForm');
    const resultDiv = document.getElementById('result');
    const copyBtn = document.getElementById('copyBtn');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const agent = document.getElementById('agent').value;
      const intent = document.getElementById('intent').value;
      const target = document.getElementById('target').value;
      const metaText = document.getElementById('meta').value;
      
      let meta = {};
      try {
        if (metaText.trim()) {
          meta = JSON.parse(metaText);
        }
      } catch (err) {
        resultDiv.innerHTML = \`
          <div class="result error">
            <div class="result-status">❌ Invalid JSON</div>
            <div class="result-detail">Check your metadata JSON syntax</div>
          </div>
        \`;
        resultDiv.style.display = 'block';
        return;
      }

      resultDiv.innerHTML = \`
        <div class="result">
          <div class="result-status">⏳ Testing...</div>
        </div>
      \`;
      resultDiv.style.display = 'block';

      vscode.postMessage({
        command: 'testAction',
        agent,
        intent,
        target,
        meta
      });
    });

    copyBtn.addEventListener('click', () => {
      const agent = document.getElementById('agent').value;
      const intent = document.getElementById('intent').value;
      const target = document.getElementById('target').value;
      const metaText = document.getElementById('meta').value;
      
      let meta = {};
      try {
        if (metaText.trim()) {
          meta = JSON.parse(metaText);
        }
      } catch {
        meta = {};
      }

      vscode.postMessage({
        command: 'copyCode',
        agent,
        intent,
        target,
        meta
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      
      if (message.command === 'testResult') {
        const result = message.result;
        let className = 'result';
        let icon = '✅';
        
        if (result.status === 'allow') {
          className = 'result success';
          icon = '✅';
        } else if (result.status === 'block') {
          className = 'result error';
          icon = '🚫';
        } else if (result.status === 'ask') {
          className = 'result ask';
          icon = '❓';
        } else if (result.status === 'error') {
          className = 'result error';
          icon = '❌';
        }

        resultDiv.innerHTML = \`
          <div class="\${className}">
            <div class="result-status">\${icon} \${result.status.toUpperCase()}</div>
            \${result.rule ? \`<div class="result-detail">Rule: <code>\${result.rule}</code></div>\` : ''}
            \${result.source ? \`<div class="result-detail">Source: \${result.source}</div>\` : ''}
            \${result.signature ? \`<div class="result-detail">Signature: \${result.signature}</div>\` : ''}
            \${result.message ? \`<div class="result-detail">\${result.message}</div>\` : ''}
          </div>
        \`;
        resultDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
    PlaygroundPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

