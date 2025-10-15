import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface WorkflowPattern {
  id: string;
  type: 'file_operations' | 'terminal_commands' | 'git_operations' | 'api_calls';
  actions: Action[];
  frequency: number;
  firstSeen: number;
  lastSeen: number;
  confidence: number;
}

interface Action {
  type: string;
  command?: string;
  files?: string[];
  timestamp: number;
  metadata?: any;
}

interface SuggestionContext {
  pattern: WorkflowPattern;
  suggestedAgentName: string;
  suggestedCode: string;
  reasoning: string;
}

export class WorkflowRecorder {
  private patterns: Map<string, WorkflowPattern> = new Map();
  private recentActions: Action[] = [];
  private readonly PATTERN_THRESHOLD = 3; // Trigger after 3 similar actions
  private readonly TIME_WINDOW = 3600000; // 1 hour in ms
  private fileWatcher?: vscode.FileSystemWatcher;
  private terminalDataListener?: vscode.Disposable;
  private gitWatcher?: vscode.Disposable;

  constructor(private context: vscode.ExtensionContext) {
    this.loadPatterns();
  }

  activate() {
    console.log('[WorkflowRecorder] Activating...');
    
    // Watch file system changes
    this.watchFileSystem();
    
    // Watch terminal commands
    this.watchTerminal();
    
    // Watch git operations
    this.watchGit();
    
    // Periodic pattern analysis
    setInterval(() => this.analyzePatterns(), 30000); // Every 30 seconds
  }

  private watchFileSystem() {
    // Watch for file changes
    this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    
    this.fileWatcher.onDidCreate((uri) => {
      this.recordAction({
        type: 'file_created',
        files: [uri.fsPath],
        timestamp: Date.now()
      });
    });
    
    this.fileWatcher.onDidChange((uri) => {
      this.recordAction({
        type: 'file_modified',
        files: [uri.fsPath],
        timestamp: Date.now()
      });
    });
    
    this.fileWatcher.onDidDelete((uri) => {
      this.recordAction({
        type: 'file_deleted',
        files: [uri.fsPath],
        timestamp: Date.now()
      });
    });
  }

  private watchTerminal() {
    // Listen to terminal commands
    vscode.window.onDidOpenTerminal((terminal) => {
      console.log('[WorkflowRecorder] Terminal opened:', terminal.name);
    });
    
    // Note: VSCode doesn't provide direct access to terminal input/output
    // This is a limitation we'll work around by detecting common patterns
    // through other means (git, file changes, etc.)
  }

  private watchGit() {
    // Watch for git operations through SCM API
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitExtension) {
      const git = gitExtension.getAPI(1);
      
      // Watch repository changes
      if (git.repositories.length > 0) {
        const repo = git.repositories[0];
        
        repo.state.onDidChange(() => {
          // Detect commits, pushes, etc.
          this.detectGitOperations(repo);
        });
      }
    }
  }

  private detectGitOperations(repo: any) {
    // Detect git patterns
    const state = repo.state;
    
    if (state.HEAD) {
      this.recordAction({
        type: 'git_operation',
        command: 'git commit',
        metadata: { branch: state.HEAD.name },
        timestamp: Date.now()
      });
    }
  }

  private recordAction(action: Action) {
    // Add to recent actions
    this.recentActions.push(action);
    
    // Keep only actions within time window
    const cutoff = Date.now() - this.TIME_WINDOW;
    this.recentActions = this.recentActions.filter(a => a.timestamp > cutoff);
    
    // Analyze for patterns
    this.detectPatterns(action);
  }

  private detectPatterns(newAction: Action) {
    // Look for repeated actions
    const similarActions = this.recentActions.filter(a => 
      this.isSimilarAction(a, newAction)
    );
    
    if (similarActions.length >= this.PATTERN_THRESHOLD) {
      // Found a pattern!
      const patternId = this.generatePatternId(similarActions);
      
      if (!this.patterns.has(patternId)) {
        // New pattern discovered
        const pattern: WorkflowPattern = {
          id: patternId,
          type: this.categorizePattern(similarActions),
          actions: similarActions,
          frequency: similarActions.length,
          firstSeen: similarActions[0].timestamp,
          lastSeen: Date.now(),
          confidence: this.calculateConfidence(similarActions)
        };
        
        this.patterns.set(patternId, pattern);
        
        // Suggest automation if confidence is high
        if (pattern.confidence > 0.7) {
          this.suggestAutomation(pattern);
        }
      } else {
        // Update existing pattern
        const pattern = this.patterns.get(patternId)!;
        pattern.frequency++;
        pattern.lastSeen = Date.now();
        pattern.confidence = this.calculateConfidence([...pattern.actions, newAction]);
      }
    }
  }

  private isSimilarAction(a1: Action, a2: Action): boolean {
    if (a1.type !== a2.type) return false;
    
    // Command similarity
    if (a1.command && a2.command) {
      return this.commandSimilarity(a1.command, a2.command) > 0.8;
    }
    
    // File operation similarity
    if (a1.files && a2.files) {
      return this.filePathSimilarity(a1.files, a2.files) > 0.7;
    }
    
    return true;
  }

  private commandSimilarity(cmd1: string, cmd2: string): number {
    // Simple similarity - can be enhanced with fuzzy matching
    const words1 = cmd1.split(' ');
    const words2 = cmd2.split(' ');
    
    if (words1[0] !== words2[0]) return 0; // Different commands
    
    return 0.9; // Same command, might have different args
  }

  private filePathSimilarity(files1: string[], files2: string[]): number {
    // Check if operations are on similar file types/locations
    const ext1 = files1[0] ? path.extname(files1[0]) : '';
    const ext2 = files2[0] ? path.extname(files2[0]) : '';
    
    return ext1 === ext2 ? 0.8 : 0.3;
  }

  private generatePatternId(actions: Action[]): string {
    const signature = actions[0].type + '_' + (actions[0].command || 'file_op');
    return signature.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private categorizePattern(actions: Action[]): WorkflowPattern['type'] {
    const firstAction = actions[0];
    
    if (firstAction.type.startsWith('git_')) return 'git_operations';
    if (firstAction.type.startsWith('file_')) return 'file_operations';
    if (firstAction.command) return 'terminal_commands';
    
    return 'file_operations';
  }

  private calculateConfidence(actions: Action[]): number {
    // Higher confidence if:
    // - More occurrences
    // - Shorter time between occurrences
    // - More consistent pattern
    
    const frequency = actions.length;
    const timeSpan = actions[actions.length - 1].timestamp - actions[0].timestamp;
    const consistency = this.measureConsistency(actions);
    
    let confidence = 0;
    confidence += Math.min(frequency / 10, 0.4); // Max 0.4 from frequency
    confidence += Math.max(0, 0.3 - (timeSpan / this.TIME_WINDOW) * 0.3); // Max 0.3 from timing
    confidence += consistency * 0.3; // Max 0.3 from consistency
    
    return Math.min(confidence, 1.0);
  }

  private measureConsistency(actions: Action[]): number {
    // How similar are the actions to each other?
    if (actions.length < 2) return 1.0;
    
    let similaritySum = 0;
    let comparisons = 0;
    
    for (let i = 0; i < actions.length - 1; i++) {
      for (let j = i + 1; j < actions.length; j++) {
        if (this.isSimilarAction(actions[i], actions[j])) {
          similaritySum += 1;
        }
        comparisons++;
      }
    }
    
    return comparisons > 0 ? similaritySum / comparisons : 0;
  }

  private async suggestAutomation(pattern: WorkflowPattern) {
    const suggestion = this.generateSuggestion(pattern);
    
    const choice = await vscode.window.showInformationMessage(
      `💡 Pattern detected: ${this.getPatternDescription(pattern)}\n\nYou've done this ${pattern.frequency} times. Want to automate it?`,
      { modal: false },
      'Generate Agent',
      'Show Details',
      'Ignore',
      'Remind Me Later'
    );
    
    if (choice === 'Generate Agent') {
      await this.generateAgentCode(suggestion);
    } else if (choice === 'Show Details') {
      await this.showPatternDetails(pattern, suggestion);
    } else if (choice === 'Ignore') {
      // Remove pattern from tracking
      this.patterns.delete(pattern.id);
    } else if (choice === 'Remind Me Later') {
      // Will suggest again after more occurrences
      pattern.frequency = 0; // Reset counter
    }
  }

  private generateSuggestion(pattern: WorkflowPattern): SuggestionContext {
    const agentName = this.suggestAgentName(pattern);
    const code = this.generateCodeFromPattern(pattern);
    const reasoning = this.generateReasoning(pattern);
    
    return {
      pattern,
      suggestedAgentName: agentName,
      suggestedCode: code,
      reasoning
    };
  }

  private suggestAgentName(pattern: WorkflowPattern): string {
    switch (pattern.type) {
      case 'git_operations':
        return 'git_workflow_bot';
      case 'file_operations':
        return 'file_manager_bot';
      case 'terminal_commands':
        return 'command_automation_bot';
      default:
        return 'workflow_bot';
    }
  }

  private generateCodeFromPattern(pattern: WorkflowPattern): string {
    const agentName = this.suggestAgentName(pattern);
    const actions = pattern.actions;
    
    let actionCode = '';
    
    if (pattern.type === 'git_operations') {
      actionCode = `
  // Detected git workflow
  await agent.emit("git.commit", "", { 
    message: "Auto-commit from agent" 
  });
  
  await agent.emit("git.push", "origin", { 
    branch: "main" 
  });`;
    } else if (pattern.type === 'file_operations') {
      const files = actions[0].files || [];
      actionCode = `
  // Detected file operations
  await agent.emit("fs.write", "${files[0] || 'output.txt'}", {
    content: "Generated content"
  });`;
    } else {
      actionCode = `
  // Detected workflow
  await agent.emit("workflow.execute", "", {
    steps: ${JSON.stringify(actions.map(a => a.type), null, 2)}
  });`;
    }
    
    return `import { echos } from "@echoshq/sdk";

const agent = echos("${agentName}");

async function main() {
  console.log("Running automated workflow...");
  
  // Apply safe policy
  await agent.applyRole({ 
    template: "internal_notifier",
    overrides: {
      ask: ["git.*", "fs.*"] // Require approval for safety
    }
  });
  ${actionCode}
  
  console.log("✅ Workflow complete!");
}

// Run on schedule or trigger manually
main().catch(console.error);
`;
  }

  private generateReasoning(pattern: WorkflowPattern): string {
    return `Detected ${pattern.frequency} similar ${pattern.type.replace(/_/g, ' ')} over the last hour. Confidence: ${(pattern.confidence * 100).toFixed(0)}%. This pattern could be automated to save time and reduce errors.`;
  }

  private getPatternDescription(pattern: WorkflowPattern): string {
    switch (pattern.type) {
      case 'git_operations':
        return 'Git workflow (commit + push)';
      case 'file_operations':
        return 'File operations pattern';
      case 'terminal_commands':
        return 'Repeated terminal commands';
      default:
        return 'Workflow pattern';
    }
  }

  private async generateAgentCode(suggestion: SuggestionContext) {
    const doc = await vscode.workspace.openTextDocument({
      content: suggestion.suggestedCode,
      language: 'typescript'
    });
    
    await vscode.window.showTextDocument(doc);
    
    vscode.window.showInformationMessage(
      `Agent code generated! Review and customize as needed.`
    );
  }

  private async showPatternDetails(pattern: WorkflowPattern, suggestion: SuggestionContext) {
    const details = {
      pattern: {
        type: pattern.type,
        frequency: pattern.frequency,
        confidence: pattern.confidence,
        actions: pattern.actions.length
      },
      suggestion: {
        agentName: suggestion.suggestedAgentName,
        reasoning: suggestion.reasoning
      }
    };
    
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(details, null, 2),
      language: 'json'
    });
    
    await vscode.window.showTextDocument(doc);
  }

  private analyzePatterns() {
    // Periodic analysis to detect longer-term patterns
    // This could look for daily/weekly patterns, etc.
    console.log(`[WorkflowRecorder] Analyzing patterns: ${this.patterns.size} tracked`);
  }

  private loadPatterns() {
    // Load saved patterns from workspace state
    const saved = this.context.workspaceState.get<any[]>('workflow_patterns', []);
    saved.forEach(p => {
      this.patterns.set(p.id, p);
    });
  }

  private savePatterns() {
    // Save patterns to workspace state
    const patterns = Array.from(this.patterns.values());
    this.context.workspaceState.update('workflow_patterns', patterns);
  }

  dispose() {
    this.savePatterns();
    this.fileWatcher?.dispose();
    this.terminalDataListener?.dispose();
    this.gitWatcher?.dispose();
  }
}

