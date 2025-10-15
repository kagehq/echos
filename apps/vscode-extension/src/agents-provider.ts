import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';

export class AgentsProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private daemonConnection: DaemonConnection) {
    // Refresh on connection changes
    this.daemonConnection.onConnectionChange(() => {
      this.refresh();
    });

    // Refresh on events
    this.daemonConnection.onEvent(() => {
      this.refresh();
    });

    // Initial load
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AgentItem): Promise<AgentItem[]> {
    if (element) {
      return [];
    }

    try {
      const roles = await this.daemonConnection.getRoles();
      
      if (!roles || roles.length === 0) {
        return [new AgentItem('No active agents', '', null)];
      }

      return roles.map(role => {
        return new AgentItem(
          role.agentId,
          role.template || 'custom',
          role.appliedAt
        );
      });
    } catch {
      return [new AgentItem('Daemon not connected', '', null)];
    }
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(
    public readonly agentId: string,
    public readonly template: string,
    public readonly appliedAt: number | null
  ) {
    super(agentId, vscode.TreeItemCollapsibleState.None);

    if (appliedAt) {
      this.description = template;
      this.tooltip = `Agent: ${agentId}\nTemplate: ${template}\nApplied: ${new Date(appliedAt).toLocaleString()}`;
      this.iconPath = new vscode.ThemeIcon('robot');
      this.contextValue = 'agent';
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'placeholder';
    }
  }
}

