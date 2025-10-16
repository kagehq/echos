/**
 * Cloudflare Durable Object Integration with Echos
 * 
 * This example shows how to integrate Echos with Cloudflare Durable Objects
 * for per-user API key management with spend capping.
 */

interface UserConfig {
  userId: string;
  dailyLimit: number;
  monthlyLimit: number;
  scopes: string[];
  createdBy?: string;
  createdReason?: string;
  customerId?: string;
  subscriptionId?: string;
}

export class EchosUserManager {
  private daemonUrl: string;
  private users: Map<string, any> = new Map();

  constructor(daemonUrl: string = 'http://127.0.0.1:3434') {
    this.daemonUrl = daemonUrl;
  }

  /**
   * Create a new user with spend limits
   * Call this when a new Minecraft server starts
   */
  async createUser(config: UserConfig) {
    const { userId, dailyLimit, monthlyLimit, scopes, createdBy, createdReason, customerId, subscriptionId } = config;
    
    // 1. Assign capped_user template with custom limits
    const templateResponse = await fetch(`${this.daemonUrl}/roles/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: userId,
        template: 'capped_user',
        overrides: {
          limits: {
            ai_daily_usd: dailyLimit,
            ai_monthly_usd: monthlyLimit,
            llm_daily_usd: dailyLimit * 0.6,
            llm_monthly_usd: monthlyLimit * 0.6
          }
        }
      })
    });

    if (!templateResponse.ok) {
      throw new Error(`Failed to assign template: ${await templateResponse.text()}`);
    }

    // 2. Issue API key with enhanced metadata
    const tokenResponse = await fetch(`${this.daemonUrl}/tokens/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: userId,
        scopes: scopes,
        durationSec: 30 * 24 * 60 * 60, // 30 days
        reason: `API key for Minecraft server ${userId}`,
        createdBy: createdBy || 'system',
        createdReason: createdReason || `Minecraft server ${userId} created`,
        customerId: customerId,
        subscriptionId: subscriptionId
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to issue token: ${await tokenResponse.text()}`);
    }

    const { token } = await tokenResponse.json();
    
    // Store user info with enhanced metadata
    this.users.set(userId, {
      token: token.token,
      expiresAt: token.expiresAt,
      limits: { dailyLimit, monthlyLimit },
      createdAt: Date.now(),
      createdBy,
      customerId,
      subscriptionId
    });

    return {
      userId,
      apiKey: token.token,
      expiresAt: token.expiresAt,
      limits: { dailyLimit, monthlyLimit },
      createdBy,
      customerId,
      subscriptionId
    };
  }

  /**
   * Check if user has exceeded their spend limits
   */
  async checkUserLimits(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const response = await fetch(`${this.daemonUrl}/metrics/llm`);
    const data = await response.json();
    
    const userSpend = data.summary.find((s: any) => s.agent === userId);
    if (!userSpend) {
      return { allowed: false, reason: 'User not found' };
    }

    const user = this.users.get(userId);
    if (!user) {
      return { allowed: false, reason: 'User not initialized' };
    }

    // Check daily limit
    if (userSpend.dailyUsd >= user.limits.dailyLimit) {
      return { 
        allowed: false, 
        reason: `Daily limit exceeded: $${userSpend.dailyUsd.toFixed(2)}/${user.limits.dailyLimit}` 
      };
    }

    // Check monthly limit
    if (userSpend.monthlyUsd >= user.limits.monthlyLimit) {
      return { 
        allowed: false, 
        reason: `Monthly limit exceeded: $${userSpend.monthlyUsd.toFixed(2)}/${user.limits.monthlyLimit}` 
      };
    }

    return { allowed: true };
  }

  /**
   * Get user's API key (for making requests to your service)
   */
  getUserApiKey(userId: string): string | null {
    const user = this.users.get(userId);
    return user?.token || null;
  }

  /**
   * Revoke user's API key (when Minecraft server shuts down)
   */
  async revokeUser(userId: string) {
    const user = this.users.get(userId);
    if (!user) return false;

    const response = await fetch(`${this.daemonUrl}/tokens/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: user.token })
    });

    if (response.ok) {
      this.users.delete(userId);
      return true;
    }

    return false;
  }

  /**
   * Get all users and their current spend
   */
  async getAllUsersSpend() {
    const response = await fetch(`${this.daemonUrl}/metrics/llm`);
    const data = await response.json();
    
    return data.summary.map((user: any) => ({
      userId: user.agent,
      dailyUsd: user.dailyUsd,
      monthlyUsd: user.monthlyUsd,
      limits: user.limits,
      isActive: this.users.has(user.agent)
    }));
  }
}

// Example Cloudflare Worker integration
export class MinecraftServerManager {
  private echosManager: EchosUserManager;

  constructor(daemonUrl: string) {
    this.echosManager = new EchosUserManager(daemonUrl);
  }

  /**
   * Called when a new Minecraft server starts
   */
  async onServerStart(serverId: string, config: { dailyLimit: number; monthlyLimit: number }) {
    try {
      const user = await this.echosManager.createUser({
        userId: serverId,
        dailyLimit: config.dailyLimit,
        monthlyLimit: config.monthlyLimit,
        scopes: ['llm.chat', 'http.request', 'fs.read', 'fs.write']
      });

      console.log(`Minecraft server ${serverId} started with API key`);
      return user;
    } catch (error) {
      console.error(`Failed to create user for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Called when a Minecraft server shuts down
   */
  async onServerStop(serverId: string) {
    try {
      await this.echosManager.revokeUser(serverId);
      console.log(`Minecraft server ${serverId} stopped, API key revoked`);
    } catch (error) {
      console.error(`Failed to revoke user for server ${serverId}:`, error);
    }
  }

  /**
   * Check if server can make API calls (spend limits)
   */
  async canServerMakeRequest(serverId: string): Promise<boolean> {
    const limits = await this.echosManager.checkUserLimits(serverId);
    return limits.allowed;
  }

  /**
   * Get server's API key for making requests
   */
  getServerApiKey(serverId: string): string | null {
    return this.echosManager.getUserApiKey(serverId);
  }
}

export { EchosUserManager };
