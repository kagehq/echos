/**
 * Chaos Testing Demo for Echos
 * 
 * Demonstrates fault injection at both SDK and daemon levels to test:
 * - Error handling and retry logic
 * - DDOS vulnerability detection
 * - Graceful degradation under failures
 * - System resilience
 * 
 * Inspired by AppVerif.exe for Windows - similar concept but for governance systems.
 * 
 * Usage:
 *   npx tsx examples/chaos-testing.ts
 */

import { echos, echosWithApiKey } from '@echoshq/sdk';

// ============================================================================
// Part 1: SDK-Level Chaos (Client-Side Failures)
// ============================================================================

async function testSdkChaos() {
  console.log('\n📍 SDK-Level Chaos Testing');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Create agent with 30% failure rate at SDK level
  const agent = echos('chaos-sdk-agent', {
    enabled: true,
    block_rate: 0.3, // 30% of requests fail before reaching daemon
    latency_ms: 100,  // Add 100ms latency to simulate network issues
  });
  
  console.log('Testing with 30% SDK failure rate + 100ms latency...\n');
  
  let succeeded = 0;
  let failed = 0;
  const attempts = 20;
  
  for (let i = 0; i < attempts; i++) {
    try {
      await agent.emit('llm.chat', `Request #${i + 1}`);
      succeeded++;
      console.log(`✅ Request ${i + 1}: SUCCESS`);
    } catch (error) {
      failed++;
      console.log(`❌ Request ${i + 1}: FAILED (${error instanceof Error ? error.message : 'Unknown error'})`);
    }
  }
  
  console.log(`\n📊 SDK Chaos Results: ${succeeded}/${attempts} succeeded, ${failed}/${attempts} failed`);
  console.log(`Expected failure rate: 30%, Actual: ${((failed / attempts) * 100).toFixed(1)}%\n`);
}

// ============================================================================
// Part 2: Daemon-Level Chaos (Policy-Based Failures)
// ============================================================================

async function testDaemonChaos() {
  console.log('\n📍 Daemon-Level Chaos Testing');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const apiKey = process.env.ECHOS_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ECHOS_API_KEY not set - skipping daemon chaos test');
    console.log('   Set an API key to test daemon-level chaos:\n');
    console.log('   export ECHOS_API_KEY="your-api-key"\n');
    return;
  }
  
  const agent = echosWithApiKey(apiKey, 'chaos-daemon-agent');
  
  // First, apply a chaos-enabled policy
  console.log('Applying chaos policy to agent...');
  const result = await agent.applyRole({
    template: 'unrestricted',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.25,      // 25% failure rate
        latency_ms: 50,         // 50ms artificial latency
        target_intents: ['llm.chat'], // Only inject chaos for LLM calls
        seed: 12345             // Reproducible chaos
      }
    }
  });
  
  if (!result.ok) {
    console.log(`❌ Failed to apply chaos policy: ${result.error}\n`);
    return;
  }
  
  console.log('✅ Chaos policy applied\n');
  console.log('Testing with 25% daemon failure rate + 50ms latency (LLM calls only)...\n');
  
  let succeeded = 0;
  let failed = 0;
  const attempts = 20;
  
  for (let i = 0; i < attempts; i++) {
    try {
      await agent.emit('llm.chat', `Chat request #${i + 1}`);
      succeeded++;
      console.log(`✅ Request ${i + 1}: SUCCESS`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ Request ${i + 1}: FAILED (${message})`);
    }
  }
  
  console.log(`\n📊 Daemon Chaos Results: ${succeeded}/${attempts} succeeded, ${failed}/${attempts} failed`);
  console.log(`Expected failure rate: 25%, Actual: ${((failed / attempts) * 100).toFixed(1)}%\n`);
  
  // Fetch chaos metrics
  console.log('Fetching chaos metrics from daemon...');
  const metrics = await agent.getChaosMetrics();
  
  console.log('\n📈 Chaos Metrics:');
  console.log(`   Total events: ${metrics.stats.totalEvents}`);
  console.log(`   Chaos enabled: ${metrics.stats.chaosEnabled}`);
  console.log(`   Chaos triggered: ${metrics.stats.chaosTriggered}`);
  console.log(`   Overall injection rate: ${(Number(metrics.chaosInjectionRate) * 100).toFixed(2)}%`);
  
  if (Object.keys(metrics.stats.byAgent).length > 0) {
    console.log('\n   By Agent:');
    for (const [agentId, stats] of Object.entries(metrics.stats.byAgent)) {
      console.log(`   - ${agentId}: ${stats.triggered}/${stats.total} (${(stats.blockRate * 100).toFixed(1)}%)`);
    }
  }
}

// ============================================================================
// Part 3: Combined Chaos (SDK + Daemon)
// ============================================================================

async function testCombinedChaos() {
  console.log('\n📍 Combined Chaos Testing (SDK + Daemon)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const apiKey = process.env.ECHOS_API_KEY;
  if (!apiKey) {
    console.log('⚠️  ECHOS_API_KEY not set - skipping combined chaos test\n');
    return;
  }
  
  // Agent with BOTH SDK and daemon chaos
  const agent = echosWithApiKey(apiKey, 'chaos-combined', {
    enabled: true,
    block_rate: 0.2,   // 20% SDK failure
    latency_ms: 75     // 75ms SDK latency
  });
  
  // Apply daemon chaos
  await agent.applyRole({
    template: 'unrestricted',
    overrides: {
      chaos: {
        enabled: true,
        block_rate: 0.15,  // 15% daemon failure
        latency_ms: 50     // 50ms daemon latency
      }
    }
  });
  
  console.log('Testing with combined chaos:');
  console.log('  - SDK: 20% failure + 75ms latency');
  console.log('  - Daemon: 15% failure + 50ms latency');
  console.log('  - Expected combined failure: ~32% (1 - (0.8 * 0.85))\n');
  
  let succeeded = 0;
  let sdkFailed = 0;
  let daemonFailed = 0;
  const attempts = 30;
  
  for (let i = 0; i < attempts; i++) {
    try {
      await agent.emit('llm.chat', `Combined chaos test #${i + 1}`);
      succeeded++;
      console.log(`✅ Request ${i + 1}: SUCCESS`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('[CHAOS]')) {
        sdkFailed++;
        console.log(`❌ Request ${i + 1}: SDK FAILURE`);
      } else {
        daemonFailed++;
        console.log(`❌ Request ${i + 1}: DAEMON FAILURE`);
      }
    }
  }
  
  const totalFailed = sdkFailed + daemonFailed;
  console.log(`\n📊 Combined Chaos Results:`);
  console.log(`   Total: ${succeeded}/${attempts} succeeded, ${totalFailed}/${attempts} failed`);
  console.log(`   SDK failures: ${sdkFailed} (${((sdkFailed / attempts) * 100).toFixed(1)}%)`);
  console.log(`   Daemon failures: ${daemonFailed} (${((daemonFailed / attempts) * 100).toFixed(1)}%)`);
  console.log(`   Combined failure rate: ${((totalFailed / attempts) * 100).toFixed(1)}%\n`);
}

// ============================================================================
// Part 4: DDOS Vulnerability Testing
// ============================================================================

async function testDdosResilience() {
  console.log('\n📍 DDOS Vulnerability Testing');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('Simulating request storm with chaos injection...\n');
  
  const agent = echos('ddos-test', {
    enabled: true,
    block_rate: 0.1,  // 10% failure under load
  });
  
  const concurrent = 50; // 50 concurrent requests
  const startTime = Date.now();
  
  const promises = Array.from({ length: concurrent }, async (_, i) => {
    try {
      await agent.emit('llm.chat', `Storm request ${i + 1}`);
      return { success: true, index: i + 1 };
    } catch (error) {
      return { success: false, index: i + 1, error };
    }
  });
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`📊 DDOS Test Results:`);
  console.log(`   Concurrent requests: ${concurrent}`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Throughput: ${(concurrent / (duration / 1000)).toFixed(2)} req/s`);
  console.log(`   Success rate: ${succeeded}/${concurrent} (${((succeeded / concurrent) * 100).toFixed(1)}%)`);
  console.log(`   Failure rate: ${failed}/${concurrent} (${((failed / concurrent) * 100).toFixed(1)}%)`);
  console.log(`   System remained stable: ${duration < 5000 ? '✅ YES' : '❌ NO (timeout)'}\n`);
}

// ============================================================================
// Part 5: Reproducible Chaos (Seeded Random)
// ============================================================================

async function testReproducibleChaos() {
  console.log('\n📍 Reproducible Chaos Testing (Seeded Random)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('Running identical tests twice with same seed...\n');
  
  const seed = 42;
  const attempts = 10;
  
  // Run 1
  console.log('🎲 Run 1 (seed: 42):');
  const agent1 = echos('reproducible-1', {
    enabled: true,
    block_rate: 0.5,
    seed: seed
  });
  
  const results1: boolean[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      await agent1.emit('test.action', `Test ${i + 1}`);
      results1.push(true);
      process.stdout.write('✅ ');
    } catch {
      results1.push(false);
      process.stdout.write('❌ ');
    }
  }
  console.log('\n');
  
  // Run 2
  console.log('🎲 Run 2 (seed: 42):');
  const agent2 = echos('reproducible-2', {
    enabled: true,
    block_rate: 0.5,
    seed: seed
  });
  
  const results2: boolean[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      await agent2.emit('test.action', `Test ${i + 1}`);
      results2.push(true);
      process.stdout.write('✅ ');
    } catch {
      results2.push(false);
      process.stdout.write('❌ ');
    }
  }
  console.log('\n');
  
  const identical = results1.every((v, i) => v === results2[i]);
  console.log(`📊 Results are identical: ${identical ? '✅ YES (reproducible)' : '❌ NO'}\n`);
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         Echos Chaos Engineering & Fault Injection            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  
  try {
    // Run all tests
    await testSdkChaos();
    await testDaemonChaos();
    await testCombinedChaos();
    await testDdosResilience();
    await testReproducibleChaos();
    
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    All Tests Complete!                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('💡 Use chaos mode to:');
    console.log('   - Test error handling and retry logic');
    console.log('   - Find DDOS vulnerabilities');
    console.log('   - Validate graceful degradation');
    console.log('   - Ensure system resilience under failures');
    console.log('');
    console.log('📚 Learn more: https://github.com/kagehq/echos/blob/main/README.md#chaos-testing');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

main();

