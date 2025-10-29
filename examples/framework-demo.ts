/**
 * Quick Demo: Framework Integration with Echos
 * 
 * Shows how Echos governance works with any agent framework
 */

import { echos } from '@echoshq/sdk';

async function demo() {
  console.log('🚀 Echos Framework Integration Demo\n');
  console.log('This shows how to wrap ANY agent tool with governance.\n');

  // Create an Echos agent
  const agent = echos('demo-agent');

  // Example 1: Allowed action (LLM chat is typically allowed)
console.log('=== Example 1: Allowed Action ===');
try {
  await agent.emit('llm.chat', 'gpt-4', {
    prompt: 'Explain quantum computing in simple terms'
  });
  console.log('✅ LLM chat allowed - agent can query AI models\n');
} catch (e: any) {
  console.log(`❌ Blocked: ${e.message}\n`);
}

// Example 2: Read-only action (typically allowed)
console.log('=== Example 2: Read-Only Action ===');
try {
  await agent.emit('http.request', 'GET https://api.github.com/repos/kagehq/echos', {
    method: 'GET'
  });
  console.log('✅ HTTP GET allowed - agent can fetch data\n');
} catch (e: any) {
  console.log(`❌ Blocked: ${e.message}\n`);
}

// Example 3: Sensitive action (requires approval by default)
console.log('=== Example 3: Sensitive Action (Email) ===');
try {
  await agent.emit('email.send', 'team@company.com', {
    subject: 'Daily Report',
    body: 'All systems operational'
  });
  console.log('✅ Email sent\n');
} catch (e: any) {
  console.log(`⏸️  Requires approval: ${e.message}\n`);
}

// Example 4: Blocked action (file deletion)
console.log('=== Example 4: Blocked Action (Destructive) ===');
try {
  await agent.emit('fs.delete', '/important/data.json');
  console.log('✅ File deleted\n');
} catch (e: any) {
  console.log(`❌ Blocked: ${e.message}\n`);
}

  console.log('---');
  console.log('🎯 Key Takeaways:');
  console.log('1. Echos works with ANY framework - just wrap your tools');
  console.log('2. Safe actions (read-only) are allowed automatically');
  console.log('3. Sensitive actions require human approval');
  console.log('4. Dangerous actions are blocked by default');
  console.log('');
  console.log('📊 View the live feed: http://localhost:3000');
  console.log('⚙️  Configure policies in: apps/daemon/templates/');
}

demo().catch(console.error);

