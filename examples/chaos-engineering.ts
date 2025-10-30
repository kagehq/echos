/**
 * Chaos Engineering Example
 * 
 * Demonstrates how to use probabilistic fault injection to test agent resilience.
 * This example shows:
 * - Basic chaos injection (random failures)
 * - Retry logic implementation
 * - Chaos metrics tracking
 * - Reproducible chaos testing (with seeds)
 * - Targeted and exempted intents
 */

import { echos } from '@echoshq/sdk';

const agent = echos('chaos-test-agent');

// Helper: Retry logic with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠️  Attempt ${attempt + 1} failed: ${lastError.message}`);
        console.log(`   Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Example 1: Basic chaos injection with retry logic
async function testBasicChaos() {
  console.log('\n=== Example 1: Basic Chaos Injection (20% failure rate) ===\n');
  
  // Apply chaos configuration
  await agent.applyRole({
    template: 'research_assistant',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.2,  // 20% of requests will be blocked
        latency_ms: 0
      }
    }
  });
  
  // Test with retry logic
  const testRuns = 10;
  let successCount = 0;
  let failureCount = 0;
  
  for (let i = 1; i <= testRuns; i++) {
    try {
      await withRetry(
        async () => {
          await agent.emit('llm.chat', 'test-model', { prompt: `Test ${i}` });
        },
        3,  // Max 3 retries
        100 // 100ms base delay
      );
      successCount++;
      console.log(`✅ Run ${i}: Success (after retries)`);
    } catch (error) {
      failureCount++;
      console.log(`❌ Run ${i}: Failed even after retries`);
    }
  }
  
  console.log(`\nResults: ${successCount}/${testRuns} successful (${failureCount} permanent failures)`);
  
  // Get chaos metrics
  const metrics = await agent.getChaosMetrics();
  console.log(`\nChaos Metrics:`);
  console.log(`- Total events: ${metrics.stats.totalEvents}`);
  console.log(`- Chaos triggered: ${metrics.stats.chaosTriggered}`);
  console.log(`- Injection rate: ${(parseFloat(metrics.chaosInjectionRate) * 100).toFixed(2)}%`);
}

// Example 2: Reproducible chaos with seeds
async function testReproducibleChaos() {
  console.log('\n=== Example 2: Reproducible Chaos (with seed) ===\n');
  
  // Apply chaos with seed for reproducible failures
  await agent.applyRole({
    template: 'research_assistant',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.3,
        seed: 42  // Same seed = same failure pattern
      }
    }
  });
  
  console.log('Run 1 (with seed 42):');
  const results1: boolean[] = [];
  for (let i = 1; i <= 10; i++) {
    try {
      await agent.emit('llm.chat', 'test', { prompt: `Test ${i}` });
      results1.push(true);
      console.log(`  ${i}: ✅ Success`);
    } catch {
      results1.push(false);
      console.log(`  ${i}: ❌ Blocked`);
    }
  }
  
  // Re-apply same configuration (same seed = same pattern)
  await agent.applyRole({
    template: 'research_assistant',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.3,
        seed: 42
      }
    }
  });
  
  console.log('\nRun 2 (with seed 42):');
  const results2: boolean[] = [];
  for (let i = 1; i <= 10; i++) {
    try {
      await agent.emit('llm.chat', 'test', { prompt: `Test ${i}` });
      results2.push(true);
      console.log(`  ${i}: ✅ Success`);
    } catch {
      results2.push(false);
      console.log(`  ${i}: ❌ Blocked`);
    }
  }
  
  // Verify reproducibility
  const identical = results1.every((val, idx) => val === results2[idx]);
  console.log(`\n${identical ? '✅' : '❌'} Failure patterns are ${identical ? 'identical' : 'different'} (reproducible: ${identical})`);
}

// Example 3: Targeted chaos (only specific intents)
async function testTargetedChaos() {
  console.log('\n=== Example 3: Targeted Chaos (specific intents only) ===\n');
  
  await agent.applyRole({
    template: 'unrestricted',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.5,  // 50% failure rate
        target_intents: ['slack.post']  // Only affect Slack posts
      }
    }
  });
  
  console.log('Testing different intents with 50% chaos on slack.post:');
  
  // Test LLM chat (should not be affected)
  console.log('\nLLM chat attempts (should NOT be affected by chaos):');
  for (let i = 1; i <= 5; i++) {
    try {
      await agent.emit('llm.chat', 'gpt-4', { prompt: `Test ${i}` });
      console.log(`  ${i}: ✅ Success`);
    } catch {
      console.log(`  ${i}: ❌ Blocked`);
    }
  }
  
  // Test Slack posts (should have ~50% failures)
  console.log('\nSlack posts (SHOULD be affected by chaos):');
  let slackFailures = 0;
  for (let i = 1; i <= 10; i++) {
    try {
      await agent.emit('slack.post', '#test', { text: `Message ${i}` });
      console.log(`  ${i}: ✅ Success`);
    } catch {
      slackFailures++;
      console.log(`  ${i}: ❌ Blocked by chaos`);
    }
  }
  
  console.log(`\nSlack posts blocked: ${slackFailures}/10 (expected ~5)`);
}

// Example 4: Latency injection
async function testLatencyInjection() {
  console.log('\n=== Example 4: Latency Injection (no failures, just delays) ===\n');
  
  await agent.applyRole({
    template: 'research_assistant',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.0,    // Don't block anything
        latency_ms: 1000    // Add 1 second delay to all requests
      }
    }
  });
  
  console.log('Testing with 1000ms artificial latency:');
  
  for (let i = 1; i <= 3; i++) {
    const startTime = Date.now();
    try {
      await agent.emit('llm.chat', 'gpt-4', { prompt: `Test ${i}` });
      const duration = Date.now() - startTime;
      console.log(`  ${i}: ✅ Success (took ${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`  ${i}: ❌ Failed after ${duration}ms`);
    }
  }
}

// Example 5: Production chaos (low rate)
async function testProductionChaos() {
  console.log('\n=== Example 5: Production Chaos (5% fault injection) ===\n');
  
  await agent.applyRole({
    template: 'research_assistant',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.05,    // Only 5% failure rate (safe for production)
        target_intents: ['llm.chat'],
        exempt_intents: ['http.request:GET*/health*']  // Never break health checks
      }
    }
  });
  
  console.log('Running 50 requests with 5% chaos (expecting ~2-3 failures):');
  
  let failures = 0;
  for (let i = 1; i <= 50; i++) {
    try {
      await agent.emit('llm.chat', 'gpt-4', { prompt: `Request ${i}` });
      process.stdout.write('.');
    } catch {
      failures++;
      process.stdout.write('X');
    }
  }
  
  console.log(`\n\nTotal failures: ${failures}/50 (${(failures/50*100).toFixed(1)}%)`);
  console.log(`Expected: ~2-3 failures (5%)`);
}

// Example 6: Metrics dashboard
async function showMetrics() {
  console.log('\n=== Chaos Metrics Dashboard ===\n');
  
  const metrics = await agent.getChaosMetrics();
  
  console.log('Overall Statistics:');
  console.log(`- Total events: ${metrics.stats.totalEvents}`);
  console.log(`- Chaos-enabled events: ${metrics.stats.chaosEnabled}`);
  console.log(`- Chaos triggered: ${metrics.stats.chaosTriggered}`);
  console.log(`- Injection rate: ${(parseFloat(metrics.chaosInjectionRate) * 100).toFixed(2)}%`);
  
  console.log('\nBy Agent:');
  for (const [agent, stats] of Object.entries(metrics.stats.byAgent)) {
    console.log(`  ${agent}:`);
    console.log(`    Total: ${stats.total}, Triggered: ${stats.triggered}, Rate: ${(stats.blockRate * 100).toFixed(1)}%`);
  }
  
  console.log('\nBy Intent:');
  for (const [intent, stats] of Object.entries(metrics.stats.byIntent)) {
    console.log(`  ${intent}:`);
    console.log(`    Total: ${stats.total}, Triggered: ${stats.triggered}, Rate: ${(stats.blockRate * 100).toFixed(1)}%`);
  }
  
  console.log('\nAgents with Chaos Enabled:');
  for (const agentConfig of metrics.agentsWithChaos) {
    console.log(`  ${agentConfig.agent} (${agentConfig.template}):`);
    console.log(`    Block rate: ${(agentConfig.blockRate * 100).toFixed(1)}%`);
    console.log(`    Latency: ${agentConfig.latencyMs}ms`);
    if (agentConfig.targetIntents) {
      console.log(`    Target intents: ${agentConfig.targetIntents.join(', ')}`);
    }
    if (agentConfig.exemptIntents) {
      console.log(`    Exempt intents: ${agentConfig.exemptIntents.join(', ')}`);
    }
  }
}

// Run all examples
async function main() {
  console.log('🔥 Chaos Engineering Demo for Echos');
  console.log('====================================');
  
  try {
    // Run examples sequentially
    await testBasicChaos();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testReproducibleChaos();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testTargetedChaos();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testLatencyInjection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testProductionChaos();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await showMetrics();
    
    console.log('\n✅ All chaos engineering examples completed!');
    console.log('\nKey Takeaways:');
    console.log('1. Always implement retry logic for resilient agents');
    console.log('2. Use reproducible chaos (seeds) for debugging');
    console.log('3. Target specific intents to isolate testing');
    console.log('4. Test latency separately from failures');
    console.log('5. Start with low rates (5%) in production');
    
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { 
  withRetry, 
  testBasicChaos, 
  testReproducibleChaos, 
  testTargetedChaos,
  testLatencyInjection,
  testProductionChaos,
  showMetrics
};

