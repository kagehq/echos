/**
 * Input Filtering Example
 * 
 * Demonstrates how Echos can filter and sanitize input content
 * to prevent sensitive data from entering agent conversations.
 * 
 * Key Features:
 * - PII Detection & Redaction (emails, phones, SSNs, credit cards)
 * - Content Classification (health, financial, legal data)
 * - Injection Attack Prevention (SQL, XSS, command injection)
 * - DSR Compliance (GDPR, CCPA data handling)
 */

import { echos } from "@echoshq/sdk";

async function main() {
  console.log("🔍 Input Filtering Example");
  console.log("========================\n");

  const agent = echos("input-filter-demo");

  // Example 1: PII Detection and Redaction
  console.log("📧 Testing PII Detection:");
  const piiContent = `
    Hi team, please contact John Smith at john.smith@company.com 
    or call him at (555) 123-4567. His SSN is 123-45-6789.
    Also, his credit card is 4532-1234-5678-9012.
  `;

  const piiResult = await agent.testInputFilter(piiContent, 'strict');
  console.log(`✅ Allowed: ${piiResult.allowed}`);
  console.log(`🔍 Classifications: ${piiResult.classifications.join(', ')}`);
  console.log(`🚫 Redactions: ${piiResult.redactions.length} items`);
  console.log(`📝 Sanitized: ${piiResult.sanitized.substring(0, 100)}...\n`);

  // Example 2: Sensitive Content Classification
  console.log("🏥 Testing Sensitive Content:");
  const sensitiveContent = `
    The patient's medical diagnosis shows signs of hypertension.
    Please review their treatment plan and medication schedule.
    Financial records indicate they have outstanding medical debt.
  `;

  const sensitiveResult = await agent.testInputFilter(sensitiveContent, 'strict');
  console.log(`✅ Allowed: ${sensitiveResult.allowed}`);
  console.log(`🔍 Classifications: ${sensitiveResult.classifications.join(', ')}`);
  console.log(`⚠️ Warnings: ${sensitiveResult.warnings.length}\n`);

  // Example 3: Injection Attack Prevention
  console.log("🛡️ Testing Injection Prevention:");
  const injectionContent = `
    SELECT * FROM users WHERE id = 1; DROP TABLE users;
    <script>alert('XSS')</script>
    rm -rf /important/files
  `;

  const injectionResult = await agent.testInputFilter(injectionContent, 'balanced');
  console.log(`✅ Allowed: ${injectionResult.allowed}`);
  console.log(`⚠️ Warnings: ${injectionResult.warnings.join(', ')}\n`);

  // Example 4: Real Agent Usage with Input Filtering
  console.log("🤖 Testing Real Agent with Input Filtering:");
  
  try {
    // This will be automatically filtered by the daemon
    await agent.emit("llm.chat", "Please analyze this data: john@example.com, 555-123-4567");
    console.log("✅ Agent action completed (content was sanitized)");
  } catch (error) {
    console.log(`❌ Agent action blocked: ${error.message}`);
  }

  // Example 5: Different Policy Levels
  console.log("\n📊 Policy Comparison:");
  
  const testContent = "Contact me at user@domain.com or call 555-123-4567";
  
  const policies = ['permissive', 'balanced', 'strict'] as const;
  for (const policy of policies) {
    const result = await agent.testInputFilter(testContent, policy);
    console.log(`${policy.toUpperCase()}: ${result.allowed ? '✅' : '❌'} (${result.redactions.length} redactions)`);
  }

  console.log("\n🎉 Input filtering example completed!");
  console.log("\nKey Benefits:");
  console.log("• Prevents PII from entering agent conversations");
  console.log("• Classifies sensitive content for compliance");
  console.log("• Blocks injection attacks automatically");
  console.log("• Supports GDPR/CCPA data handling requirements");
  console.log("• Configurable policy levels (permissive/balanced/strict)");
}

// Run the example
main().catch(console.error);
