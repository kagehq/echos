import * as vscode from 'vscode';
import { DaemonConnection } from './daemon-connection';

export class TimelineProvider implements vscode.TreeDataProvider<TimelineItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TimelineItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private daemonConnection: DaemonConnection) {
    // Refresh timeline on events
    this.daemonConnection.onEvent(() => {
      this.refresh();
    });

    // Initial load
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TimelineItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TimelineItem): Promise<TimelineItem[]> {
    if (element) {
      return [];
    }

    try {
      const timeline = await this.daemonConnection.getTimeline();
      return timeline.slice(0, 20).map((event, idx) => {
        const item = new TimelineItem(event, idx);
        return item;
      });
    } catch {
      return [];
    }
  }
}

class TimelineItem extends vscode.TreeItem {
  constructor(
    public readonly event: any,
    private index: number
  ) {
    super(
      TimelineItem.getLabel(event),
      vscode.TreeItemCollapsibleState.None
    );

    this.tooltip = TimelineItem.getTooltip(event);
    this.description = TimelineItem.getDescription(event);
    this.iconPath = new vscode.ThemeIcon(TimelineItem.getIcon(event));
    this.contextValue = event.type;
  }

  private static getLabel(event: any): string {
    if (event.type === 'event') {
      return `${event.event.intent}${event.event.target ? ` → ${event.event.target}` : ''}`;
    } else if (event.type === 'ask') {
      return `[ASK] ${event.event.intent}`;
    } else if (event.type === 'decision') {
      return `[DECISION] ${event.payload.status}`;
    } else if (event.type === 'token') {
      return `[TOKEN] ${event.action}`;
    } else if (event.type === 'roleApplied') {
      return `[ROLE] ${event.template}`;
    }
    return event.type || 'Unknown';
  }

  private static getDescription(event: any): string {
    const time = new Date(event.ts).toLocaleTimeString();
    if (event.event?.agent || event.agent) {
      return `${event.event?.agent || event.agent} · ${time}`;
    }
    return time;
  }

  private static getTooltip(event: any): string {
    const lines = [
      `Type: ${event.type}`,
      `Time: ${new Date(event.ts).toLocaleString()}`
    ];

    if (event.event) {
      lines.push(`Agent: ${event.event.agent}`);
      lines.push(`Intent: ${event.event.intent}`);
      if (event.event.target) lines.push(`Target: ${event.event.target}`);
      if (event.event.policy) {
        lines.push(`Policy: ${event.event.policy.status}`);
        if (event.event.policy.rule) lines.push(`Rule: ${event.event.policy.rule}`);
      }
    }

    return lines.join('\n');
  }

  private static getIcon(event: any): string {
    if (event.type === 'ask') return 'question';
    if (event.type === 'decision') {
      return event.payload.status === 'allow' ? 'check' : 'x';
    }
    if (event.type === 'token') return 'key';
    if (event.type === 'roleApplied') return 'shield';
    if (event.type === 'event') {
      const status = event.event?.policy?.status;
      if (status === 'allow') return 'pass';
      if (status === 'block') return 'circle-slash';
      return 'circle-outline';
    }
    return 'circle-outline';
  }
}

