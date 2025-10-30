# Chaos Engineering for AI Agents

Echos now supports **probabilistic fault injection** to test agent resilience and error handling. This feature lets you inject random failures and latency into agent actions to discover bugs before they hit production.

## Why Chaos Engineering for AI Agents?

AI agents are autonomous systems that need to handle failures gracefully:

- **Resilience Testing**: Verify agents retry failed actions appropriately
- **Error Handling**: Ensure agents don't crash when actions are denied
- **Production Safety**: Find edge cases before they impact users
- **Performance Testing**: Test behavior under degraded network conditions
- **Debugging**: Reproduce specific failure scenarios with seeds

## Quick Start

```typescript
import { echos } from '@echoshq/sdk';

const agent = echos('my-agent');

// Enable 20% chaos for testing
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.2,  // Block 20% of requests randomly
      latency_ms: 0     // No artificial latency
    }
  }
});

// Your agent will now randomly fail 20% of actions
// Use this to test your retry logic
```

## Configuration Options

```typescript
interface ChaosConfig {
  enabled?: boolean;           // Enable/disable chaos injection
  block_rate?: number;         // 0-1, probability of blocking (0.2 = 20%)
  latency_ms?: number;         // Artificial latency in milliseconds
  seed?: number;               // Optional seed for reproducible chaos
  target_intents?: string[];   // Only inject chaos for these intents
  exempt_intents?: string[];   // Never inject chaos for these intents
}
```

## Use Cases

### 1. Development Testing (20% Chaos)

Test your retry logic during development:

```typescript
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.2
    }
  }
});
```

### 2. Production Chaos Engineering (5% Chaos)

Safely test resilience in production with low failure rates:

```typescript
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.05,  // Only 5% failures
      target_intents: ['llm.chat'],
      exempt_intents: ['http.request:GET*/health*']
    }
  }
});
```

### 3. Reproducible Debugging

Use seeds to reproduce specific failure patterns:

```typescript
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
```

### 4. Latency Testing

Test agent behavior under slow network conditions:

```typescript
await agent.applyRole({
  template: 'research_assistant',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.0,    // Don't block anything
      latency_ms: 2000    // Add 2 seconds to all requests
    }
  }
});
```

### 5. Targeted Chaos

Only inject failures for specific actions:

```typescript
await agent.applyRole({
  template: 'unrestricted',
  overrides: {
    chaos: {
      enabled: true,
      block_rate: 0.5,
      target_intents: ['slack.post', 'email.send'],  // Only affect these
      exempt_intents: ['http.request:GET*/health*']  // Never break health checks
    }
  }
});
```

## Policy Templates

Pre-configured chaos templates are available in `apps/daemon/templates/`:

- **`chaos_testing.yaml`**: 20% chaos for development testing
- **`chaos_aggressive.yaml`**: 50% chaos + latency for stress testing
- **`chaos_production.yaml`**: 5% chaos for production monitoring
- **`chaos_latency.yaml`**: No failures, only latency injection

Use them with:

```typescript
await agent.applyRole({ template: 'chaos_testing' });
```

## Metrics & Monitoring

Track chaos injection statistics:

```typescript
const metrics = await agent.getChaosMetrics();

console.log(`Chaos injection rate: ${metrics.chaosInjectionRate}`);
console.log(`Total blocked by chaos: ${metrics.stats.chaosTriggered}`);

// Per-agent statistics
for (const [agent, stats] of Object.entries(metrics.stats.byAgent)) {
  console.log(`${agent}: ${stats.triggered}/${stats.total} blocked`);
}

// Per-intent statistics
for (const [intent, stats] of Object.entries(metrics.stats.byIntent)) {
  console.log(`${intent}: ${(stats.blockRate * 100).toFixed(1)}% failure rate`);
}
```

Access via HTTP:

```bash
curl http://127.0.0.1:3434/metrics/chaos | jq
```

## Best Practices

1. **Start Low**: Begin with 5-10% chaos in development, 1-5% in production
2. **Use Seeds**: Enable reproducible debugging with `seed` parameter
3. **Target Wisely**: Use `target_intents` to isolate testing
4. **Exempt Critical Paths**: Always exempt health checks and critical endpoints
5. **Monitor Metrics**: Track chaos injection rates to validate configuration
6. **Implement Retries**: Add exponential backoff retry logic to handle failures
7. **Test Before Production**: Validate chaos configuration in staging first

## Example: Retry Logic

Always implement retry logic when using chaos:

```typescript
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
        console.log(`Retry ${attempt + 1} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Use it:
await withRetry(async () => {
  await agent.emit('slack.post', '#general', { text: 'Hello!' });
});
```

## Full Example

See [`examples/chaos-engineering.ts`](examples/chaos-engineering.ts) for a complete demonstration including:

- Basic chaos injection with retry logic
- Reproducible chaos with seeds
- Targeted chaos for specific intents
- Latency injection testing
- Production chaos patterns
- Metrics dashboard

Run it:

```bash
tsx examples/chaos-engineering.ts
```

## Dashboard Integration

Chaos-blocked actions appear in the dashboard timeline with:

- 🔥 Chaos indicator
- Block rate percentage
- "Chaos injection triggered" in the error message
- Full chaos configuration details

This helps you understand which failures were intentionally injected vs. real policy blocks.

## Technical Details

### How It Works

1. Agent sends action to daemon
2. Daemon checks policy (allow/block/ask)
3. **If chaos enabled**: Daemon probabilistically decides to block based on `block_rate`
4. **If latency configured**: Daemon injects artificial delay
5. Action is either allowed or blocked (with chaos attribution)
6. Event is logged with chaos metadata for metrics

### Deterministic Chaos (Seeds)

When a seed is provided, Echos uses a Linear Congruential Generator (LCG) to generate reproducible pseudo-random numbers. The same seed + event ID combination always produces the same decision.

This enables:
- Reproducible test runs
- Debugging specific failure patterns
- Consistent CI/CD test results

### Performance Impact

Chaos injection adds minimal overhead:
- Random number generation: ~0.01ms
- Latency injection: Configurable (adds exactly `latency_ms`)
- Decision logic: No measurable impact (<0.1ms)

## API Reference

### SDK Methods

```typescript
// Apply chaos configuration
await agent.applyRole({
  template: 'research_assistant',
  overrides: { chaos: { enabled: true, block_rate: 0.2 } }
});

// Get chaos metrics
const metrics = await agent.getChaosMetrics();
```

### HTTP Endpoints

```bash
# Get chaos metrics
GET /metrics/chaos

# Apply role with chaos
POST /roles/apply
{
  "agentId": "my-agent",
  "template": "research_assistant",
  "overrides": {
    "chaos": {
      "enabled": true,
      "block_rate": 0.2
    }
  }
}
```

## Comparison to Other Tools

| Feature | Echos Chaos | Netflix Chaos Monkey | Gremlin | Toxiproxy |
|---------|-------------|---------------------|---------|-----------|
| AI Agent Focus | ✅ | ❌ | ❌ | ❌ |
| Probabilistic Blocking | ✅ | ✅ | ✅ | ✅ |
| Latency Injection | ✅ | ❌ | ✅ | ✅ |
| Reproducible (Seeds) | ✅ | ❌ | ❌ | ❌ |
| Per-Action Control | ✅ | ❌ | ❌ | ❌ |
| Built-in Metrics | ✅ | ✅ | ✅ | ❌ |

Echos is specifically designed for testing **autonomous AI agents**, not infrastructure.

## Future Enhancements

Potential future additions:
- Custom failure modes (timeouts, partial responses)
- Chaos schedules (time-based chaos windows)
- Blast radius limits (max concurrent failures)
- Chaos experiments (hypothesis testing framework)
- Integration with observability tools (Datadog, New Relic)

## Feedback

This is a new feature! We'd love to hear:
- What chaos patterns are most useful for your agents?
- What failure modes should we add?
- How do you use chaos engineering in production?

Share feedback on [Discord](https://discord.gg/KqdBcqRk5E) or [GitHub Issues](https://github.com/kagehq/echos/issues).

