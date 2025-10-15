import * as vscode from 'vscode';

export class EchosCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.RefactorRewrite,
    vscode.CodeActionKind.QuickFix
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] | undefined {
    const selectedText = document.getText(range);
    
    if (!selectedText || selectedText.trim().length === 0) {
      return undefined;
    }

    const actions: vscode.CodeAction[] = [];

    // Action 1: Wrap with Echos
    const wrapAction = this.createWrapWithEchosAction(document, range, selectedText);
    actions.push(wrapAction);

    // Action 2: Convert to Agent
    if (this.looksLikeConvertibleCode(selectedText)) {
      const convertAction = this.createConvertToAgentAction(document, range, selectedText);
      actions.push(convertAction);
    }

    // Action 3: Add Policy Check
    if (this.looksLikeActionCall(selectedText)) {
      const policyAction = this.createAddPolicyCheckAction(document, range, selectedText);
      actions.push(policyAction);
    }

    return actions;
  }

  private createWrapWithEchosAction(
    document: vscode.TextDocument,
    range: vscode.Range,
    selectedText: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '🤖 Wrap with Echos',
      vscode.CodeActionKind.RefactorRewrite
    );
    
    action.edit = new vscode.WorkspaceEdit();
    
    // Detect the intent from the code
    const intent = this.detectIntent(selectedText);
    const target = this.extractTarget(selectedText);
    
    const wrappedCode = this.wrapCodeWithEchos(selectedText, intent, target);
    action.edit.replace(document.uri, range, wrappedCode);
    
    action.isPreferred = true;
    return action;
  }

  private createConvertToAgentAction(
    document: vscode.TextDocument,
    range: vscode.Range,
    selectedText: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '🚀 Convert to Autonomous Agent',
      vscode.CodeActionKind.RefactorRewrite
    );
    
    action.command = {
      command: 'echos.convertToAgent',
      title: 'Convert to Agent',
      arguments: [selectedText]
    };
    
    return action;
  }

  private createAddPolicyCheckAction(
    document: vscode.TextDocument,
    range: vscode.Range,
    selectedText: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      '🛡️ Add Policy Check',
      vscode.CodeActionKind.QuickFix
    );
    
    const intent = this.detectIntent(selectedText);
    const wrappedCode = `try {
  await agent.emit("${intent}", /* target */, { /* meta */ });
  ${selectedText}
} catch (err) {
  console.error("Action blocked by policy:", err);
}`;
    
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, range, wrappedCode);
    
    return action;
  }

  private detectIntent(code: string): string {
    // Detect common patterns
    if (code.includes('fetch(') || code.includes('axios') || code.includes('http')) {
      return 'http.request';
    }
    if (code.includes('fs.write') || code.includes('writeFile')) {
      return 'fs.write';
    }
    if (code.includes('fs.unlink') || code.includes('delete')) {
      return 'fs.delete';
    }
    if (code.includes('slack') || code.includes('postMessage')) {
      return 'slack.post';
    }
    if (code.includes('email') || code.includes('sendMail')) {
      return 'email.send';
    }
    if (code.includes('git') || code.includes('commit')) {
      return 'git.commit';
    }
    
    return 'custom.action';
  }

  private extractTarget(code: string): string {
    // Try to extract URL, file path, etc.
    const urlMatch = code.match(/['"`](https?:\/\/[^'"`]+)['"`]/);
    if (urlMatch) return urlMatch[1];
    
    const fileMatch = code.match(/['"`]([./][^'"`]+)['"`]/);
    if (fileMatch) return fileMatch[1];
    
    return '';
  }

  private wrapCodeWithEchos(code: string, intent: string, target: string): string {
    const indentMatch = code.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    
    return `${indent}// Check with Echos before executing
${indent}await agent.emit("${intent}", "${target}", { 
${indent}  /* Add metadata here */
${indent}});

${code}`;
  }

  private looksLikeConvertibleCode(code: string): boolean {
    // Check if code looks like it could be a full agent
    const lines = code.split('\n').length;
    return lines > 5 && (
      code.includes('function') ||
      code.includes('async') ||
      code.includes('await')
    );
  }

  private looksLikeActionCall(code: string): boolean {
    // Check if code is an action that should be policy-checked
    return (
      code.includes('fetch(') ||
      code.includes('writeFile') ||
      code.includes('unlink') ||
      code.includes('post') ||
      code.includes('send')
    );
  }
}

export class EchosCodeActionCommands {
  static register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.commands.registerCommand('echos.convertToAgent', async (selectedCode: string) => {
        await this.convertToAgent(selectedCode);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('echos.wrapWithEchos', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        
        if (!selectedText) {
          vscode.window.showWarningMessage('Please select code to wrap with Echos');
          return;
        }

        // Apply the transformation
        const provider = new EchosCodeActionProvider();
        const actions = provider.provideCodeActions(editor.document, selection);
        
        if (actions && actions.length > 0) {
          const edit = actions[0].edit;
          if (edit) {
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('Code wrapped with Echos!');
          }
        }
      })
    );
  }

  private static async convertToAgent(selectedCode: string) {
    const agentName = await vscode.window.showInputBox({
      prompt: 'Enter agent name',
      placeHolder: 'my_agent',
      value: 'converted_agent'
    });

    if (!agentName) return;

    const template = await vscode.window.showQuickPick(
      ['research_assistant', 'customer_support', 'internal_notifier', 'unrestricted'],
      { placeHolder: 'Select policy template' }
    );

    if (!template) return;

    const agentCode = `import { echos } from "@echoshq/sdk";

const agent = echos("${agentName}");

async function main() {
  console.log("Agent ${agentName} starting...");
  
  // Apply policy template
  await agent.applyRole({ template: "${template}" });
  
  // Your converted code:
${selectedCode.split('\n').map(line => '  ' + line).join('\n')}
  
  console.log("✅ Agent complete!");
}

// Run agent
main().catch(console.error);
`;

    const doc = await vscode.workspace.openTextDocument({
      content: agentCode,
      language: 'typescript'
    });

    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Agent "${agentName}" created!`);
  }
}

