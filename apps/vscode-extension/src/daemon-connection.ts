import WebSocket from 'ws';

type ConnectionCallback = (connected: boolean, stats: ConnectionStats) => void;
type ApprovalCallback = (event: any) => void;
type EventCallback = (event: any) => void;

interface ConnectionStats {
  activeAgents: number;
  totalEvents: number;
}

export class DaemonConnection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionCallbacks: ConnectionCallback[] = [];
  private approvalCallbacks: ApprovalCallback[] = [];
  private eventCallbacks: EventCallback[] = [];
  private stats: ConnectionStats = { activeAgents: 0, totalEvents: 0 };
  private isConnected = false;

  constructor(private daemonUrl: string) {}

  connect() {
    if (this.ws) {
      return; // Already connected or connecting
    }

    const wsUrl = this.daemonUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    console.log(`Connecting to Echos daemon: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('Connected to Echos daemon');
        this.isConnected = true;
        this.notifyConnection(true);
        this.fetchStats();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected from Echos daemon');
        this.isConnected = false;
        this.ws = null;
        this.notifyConnection(false);
        this.scheduleReconnect();
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    } catch (err) {
      console.error('Failed to connect to daemon:', err);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private handleMessage(msg: any) {
    // Update stats on any message
    this.fetchStats();

    // Handle different message types
    if (msg.type === 'ask') {
      this.approvalCallbacks.forEach(cb => cb(msg));
    } else if (msg.type === 'event' || msg.type === 'decision') {
      this.eventCallbacks.forEach(cb => cb(msg));
    }
  }

  private async fetchStats() {
    try {
      const [timeline, roles] = await Promise.all([
        fetch(`${this.daemonUrl}/timeline`).then(r => r.json()),
        fetch(`${this.daemonUrl}/roles`).then(r => r.json())
      ]);

      const agents = new Set<string>();
      timeline.events?.forEach((e: any) => {
        if (e.event?.agent) agents.add(e.event.agent);
        if (e.agent) agents.add(e.agent);
      });

      this.stats = {
        activeAgents: agents.size || roles.roles?.length || 0,
        totalEvents: timeline.events?.length || 0
      };

      this.notifyConnection(this.isConnected);
    } catch (err) {
      // Ignore fetch errors
    }
  }

  private notifyConnection(connected: boolean) {
    this.connectionCallbacks.forEach(cb => cb(connected, this.stats));
  }

  onConnectionChange(callback: ConnectionCallback) {
    this.connectionCallbacks.push(callback);
    // Immediately notify current state
    callback(this.isConnected, this.stats);
  }

  onApprovalRequest(callback: ApprovalCallback) {
    this.approvalCallbacks.push(callback);
  }

  onEvent(callback: EventCallback) {
    this.eventCallbacks.push(callback);
  }

  async testAction(intent: string, target: string): Promise<any> {
    const res = await fetch(`${this.daemonUrl}/policy/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'vscode_test', intent, target })
    });
    return res.json();
  }

  async respondToApproval(
    id: string, 
    status: 'allow' | 'block', 
    grant?: { scopes: string[]; durationSec: number; reason: string }
  ): Promise<void> {
    await fetch(`${this.daemonUrl}/decide/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, grant })
    });
  }

  async listTemplates(): Promise<any[]> {
    try {
      const res = await fetch(`${this.daemonUrl}/templates`);
      const data = await res.json();
      return data.templates || [];
    } catch {
      return [];
    }
  }

  async getTimeline(): Promise<any[]> {
    try {
      const res = await fetch(`${this.daemonUrl}/timeline`);
      const data = await res.json();
      return data.events || [];
    } catch {
      return [];
    }
  }

  async getRoles(): Promise<any[]> {
    try {
      const res = await fetch(`${this.daemonUrl}/roles`);
      const data = await res.json();
      return data.roles || [];
    } catch {
      return [];
    }
  }

  async getPolicy(agentId?: string): Promise<any> {
    try {
      const id = agentId || 'default';
      const res = await fetch(`${this.daemonUrl}/roles/${encodeURIComponent(id)}`);
      return await res.json();
    } catch {
      return { allow: [], ask: [], block: [] };
    }
  }

  async applyPolicy(agentId: string, policy: any): Promise<void> {
    await fetch(`${this.daemonUrl}/roles/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, policy })
    });
  }

  async validateYaml(yaml: string): Promise<any> {
    const res = await fetch(`${this.daemonUrl}/templates/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml })
    });
    return res.json();
  }

  async listTokens(): Promise<any[]> {
    try {
      const res = await fetch(`${this.daemonUrl}/tokens/list`);
      const data = await res.json();
      return data.tokens || [];
    } catch {
      return [];
    }
  }

  async revokeToken(token: string): Promise<void> {
    await fetch(`${this.daemonUrl}/tokens/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
  }

  async pauseToken(token: string): Promise<void> {
    await fetch(`${this.daemonUrl}/tokens/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
  }

  async resumeToken(token: string): Promise<void> {
    await fetch(`${this.daemonUrl}/tokens/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
  }

  async createToken(scopes: string[], durationSec: number, reason: string): Promise<void> {
    await fetch(`${this.daemonUrl}/tokens/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'vscode_user', scopes, durationSec, reason })
    });
  }
}

