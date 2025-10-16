#!/usr/bin/env node
/**
 * Enhanced Metadata Example
 * 
 * This script demonstrates how to use all the enhanced metadata fields
 * for comprehensive tracking and monitoring.
 */

import { echos } from '../packages/sdk/dist/index.js';

const DAEMON_URL = process.env.ECHOS_DAEMON_URL || 'http://127.0.0.1:3434';

async function demonstrateEnhancedMetadata() {
  console.log('🚀 Demonstrating Enhanced Metadata Features\n');

  // 1. Create a user with full business context
  console.log('1. Creating user with enhanced metadata...');
  
  const userResponse = await fetch(`${DAEMON_URL}/tokens/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent: 'demo-enhanced-user',
      scopes: ['llm.chat', 'http.request'],
      durationSec: 3600, // 1 hour
      reason: 'Enhanced metadata demonstration',
      createdBy: 'admin@company.com',
      createdReason: 'Demo user for enhanced tracking',
      customerId: 'cust_demo_123',
      subscriptionId: 'sub_demo_456'
    })
  });

  if (!userResponse.ok) {
    throw new Error(`Failed to create user: ${await userResponse.text()}`);
  }

  const { token } = await userResponse.json();
  console.log(`✅ User created with API key: ${token.token.substring(0, 20)}...`);

  // 2. Apply role with spend limits
  console.log('\n2. Applying role with spend limits...');
  
  const roleResponse = await fetch(`${DAEMON_URL}/roles/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: 'demo-enhanced-user',
      template: 'capped_user',
      overrides: {
        limits: {
          ai_daily_usd: 5.00,
          ai_monthly_usd: 100.00,
          llm_daily_usd: 3.00,
          llm_monthly_usd: 60.00
        }
      }
    })
  });

  if (!roleResponse.ok) {
    throw new Error(`Failed to apply role: ${await roleResponse.text()}`);
  }

  console.log('✅ Role applied with spend limits');

  // 3. Make API calls with enhanced metadata
  console.log('\n3. Making API calls with enhanced metadata...');
  
  const agent = echos('demo-enhanced-user', DAEMON_URL);
  
  // Simulate an LLM chat with full metadata
  try {
    const startTime = Date.now();
    
    // This would normally be done by the SDK, but we'll simulate it
    const eventResponse = await fetch(`${DAEMON_URL}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'demo-enhanced-user',
        intent: 'llm.chat',
        target: 'gpt-4',
        ts: Date.now(),
        costUsd: 0.75,
        // Enhanced business context
        customerId: 'cust_demo_123',
        subscriptionId: 'sub_demo_456',
        feature: 'chat_completion',
        environment: 'production',
        // Performance metrics
        duration: 1250,
        tokensUsed: 1500,
        modelVersion: 'gpt-4-1106-preview',
        latency: 1200,
        // Audit trail
        userAgent: 'EchosDemo/1.0',
        ipAddress: '192.168.1.100',
        sessionId: 'sess_demo_789',
        correlationId: 'corr_demo_abc123',
        // Request/response data
        request: {
          messages: [
            { role: 'user', content: 'Hello, how are you?' }
          ],
          model: 'gpt-4',
          temperature: 0.7
        },
        response: {
          choices: [
            {
              message: { role: 'assistant', content: 'I am doing well, thank you!' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
        }
      })
    });

    if (!eventResponse.ok) {
      throw new Error(`Failed to record event: ${await eventResponse.text()}`);
    }

    console.log('✅ LLM chat event recorded with full metadata');
    
  } catch (error) {
    console.error('❌ Error making API call:', error);
  }

  // 4. Check current spend
  console.log('\n4. Checking current spend...');
  
  const metricsResponse = await fetch(`${DAEMON_URL}/metrics/llm`);
  const metrics = await metricsResponse.json();
  
  const userSpend = metrics.summary.find((s: any) => s.agent === 'demo-enhanced-user');
  if (userSpend) {
    console.log(`✅ Current spend: $${userSpend.dailyUsd.toFixed(2)}/day, $${userSpend.monthlyUsd.toFixed(2)}/month`);
  }

  // 5. Get timeline with enhanced metadata
  console.log('\n5. Fetching timeline with enhanced metadata...');
  
  const timelineResponse = await fetch(`${DAEMON_URL}/timeline`);
  const timeline = await timelineResponse.json();
  
  const recentEvents = timeline.events?.slice(0, 3) || [];
  console.log('✅ Recent events with metadata:');
  
  recentEvents.forEach((event: any, index: number) => {
    console.log(`\nEvent ${index + 1}:`);
    console.log(`  Type: ${event.type}`);
    console.log(`  Agent: ${event.event?.agent || event.agent || 'N/A'}`);
    console.log(`  Intent: ${event.event?.intent || 'N/A'}`);
    console.log(`  Cost: $${event.event?.costUsd || 0}`);
    console.log(`  Customer: ${event.event?.customerId || 'N/A'}`);
    console.log(`  Feature: ${event.event?.feature || 'N/A'}`);
    console.log(`  Environment: ${event.event?.environment || 'N/A'}`);
    console.log(`  Duration: ${event.event?.duration || 'N/A'}ms`);
    console.log(`  Tokens: ${event.event?.tokensUsed || 'N/A'}`);
    console.log(`  IP: ${event.event?.ipAddress || 'N/A'}`);
    console.log(`  Correlation: ${event.event?.correlationId || 'N/A'}`);
  });

  console.log('\n🎉 Enhanced metadata demonstration complete!');
  console.log('\n📊 What you can now track:');
  console.log('  ✅ User attribution (who created users)');
  console.log('  ✅ Business context (customers, subscriptions)');
  console.log('  ✅ Performance metrics (duration, tokens, latency)');
  console.log('  ✅ Audit trail (IP addresses, user agents)');
  console.log('  ✅ Error context (error codes, stack traces)');
  console.log('  ✅ Correlation IDs (for distributed tracing)');
  console.log('  ✅ Environment context (prod/staging/dev)');
  
  console.log('\n🔍 Check the dashboard at http://localhost:3000 to see the enhanced metadata!');
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEnhancedMetadata().catch(console.error);
}

export { demonstrateEnhancedMetadata };
