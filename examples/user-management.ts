#!/usr/bin/env node
/**
 * Echos User Management Example
 * 
 * This script demonstrates how to programmatically:
 * 1. Create users with capped spend limits
 * 2. Issue API keys for each user
 * 3. Monitor usage and enforce limits
 * 
 * Perfect for: 1 user = 1 Minecraft server = 1 durable object
 */

import { echos } from '../packages/sdk/dist/index.js';

const DAEMON_URL = process.env.ECHOS_DAEMON_URL || 'http://127.0.0.1:3434';

interface UserConfig {
  userId: string;
  dailyLimit: number;
  monthlyLimit: number;
  scopes: string[];
  durationDays: number;
  createdBy?: string;
  createdReason?: string;
  customerId?: string;
  subscriptionId?: string;
}

class UserManager {
  private daemon: any;

  constructor(daemonUrl: string) {
    this.daemon = echos('user-manager', daemonUrl);
  }

  /**
   * Create a new user with capped spend limits
   */
  async createUser(config: UserConfig) {
    const { userId, dailyLimit, monthlyLimit, scopes, durationDays, createdBy, createdReason, customerId, subscriptionId } = config;
    
    console.log(`Creating user: ${userId}`);
    
    // 1. Assign the capped_user template to the agent
    const templateResponse = await fetch(`${DAEMON_URL}/roles/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: userId,
        template: 'capped_user',
        overrides: {
          limits: {
            ai_daily_usd: dailyLimit,
            ai_monthly_usd: monthlyLimit,
            llm_daily_usd: dailyLimit * 0.6,  // 60% of daily limit for LLM
            llm_monthly_usd: monthlyLimit * 0.6  // 60% of monthly limit for LLM
          }
        }
      })
    });

    if (!templateResponse.ok) {
      throw new Error(`Failed to assign template: ${await templateResponse.text()}`);
    }

    // 2. Issue an API key for the user with enhanced metadata
    const tokenResponse = await fetch(`${DAEMON_URL}/tokens/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: userId,
        scopes: scopes,
        durationSec: durationDays * 24 * 60 * 60, // Convert days to seconds
        reason: `API key for user ${userId}`,
        createdBy: createdBy || 'system',
        createdReason: createdReason || `User ${userId} created`,
        customerId: customerId,
        subscriptionId: subscriptionId
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to issue token: ${await tokenResponse.text()}`);
    }

    const { token } = await tokenResponse.json();
    
    console.log(`✅ User ${userId} created with API key`);
    console.log(`   Daily limit: $${dailyLimit}`);
    console.log(`   Monthly limit: $${monthlyLimit}`);
    console.log(`   Token expires in: ${durationDays} days`);
    console.log(`   Created by: ${createdBy || 'system'}`);
    console.log(`   Customer ID: ${customerId || 'N/A'}`);
    
    return {
      userId,
      token: token.token,
      expiresAt: token.expiresAt,
      limits: { dailyLimit, monthlyLimit },
      createdBy,
      customerId,
      subscriptionId
    };
  }

  /**
   * Check user's current spend
   */
  async getUserSpend(userId: string) {
    const response = await fetch(`${DAEMON_URL}/metrics/llm`);
    const data = await response.json();
    
    const userSpend = data.summary.find((s: any) => s.agent === userId);
    return userSpend || null;
  }

  /**
   * List all users and their spend
   */
  async listUsers() {
    const response = await fetch(`${DAEMON_URL}/metrics/llm`);
    const data = await response.json();
    
    return data.summary.map((user: any) => ({
      agent: user.agent,
      dailyUsd: user.dailyUsd,
      monthlyUsd: user.monthlyUsd,
      limits: user.limits
    }));
  }

  /**
   * Revoke a user's API key
   */
  async revokeUser(userId: string, token: string) {
    const response = await fetch(`${DAEMON_URL}/tokens/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Failed to revoke token: ${await response.text()}`);
    }

    console.log(`✅ Revoked API key for user ${userId}`);
    return true;
  }
}

// Example usage
async function main() {
  const userManager = new UserManager(DAEMON_URL);

  try {
    // Create users for your Minecraft servers with enhanced metadata
    const users = [
      {
        userId: 'minecraft-server-1',
        dailyLimit: 10.00,
        monthlyLimit: 200.00,
        scopes: ['llm.chat', 'http.request', 'fs.read', 'fs.write'],
        durationDays: 30,
        createdBy: 'admin@company.com',
        createdReason: 'New Minecraft server deployment',
        customerId: 'cust_abc123',
        subscriptionId: 'sub_xyz789'
      },
      {
        userId: 'minecraft-server-2', 
        dailyLimit: 5.00,
        monthlyLimit: 100.00,
        scopes: ['llm.chat', 'http.request'],
        durationDays: 30,
        createdBy: 'admin@company.com',
        createdReason: 'Additional server for customer',
        customerId: 'cust_def456',
        subscriptionId: 'sub_abc123'
      }
    ];

    console.log('🚀 Creating users with capped spend limits...\n');

    for (const userConfig of users) {
      const user = await userManager.createUser(userConfig);
      console.log(`User created: ${user.userId}`);
      console.log(`API Key: ${user.token.substring(0, 20)}...`);
      console.log('');
    }

    // Check current spend
    console.log('📊 Current user spend:');
    const allUsers = await userManager.listUsers();
    allUsers.forEach(user => {
      console.log(`${user.agent}: $${user.dailyUsd.toFixed(2)}/day, $${user.monthlyUsd.toFixed(2)}/month`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { UserManager };
