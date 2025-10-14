#!/usr/bin/env tsx
/**
 * Developer Tools Demo
 * 
 * Demonstrates the new developer tools features:
 * - Policy testing (dry-run)
 * - Template validation
 * - Webhook management
 * - Debug mode
 */

import { echos } from "@echoshq/sdk";

async function main() {
  console.log("🛠️  Echos Developer Tools Demo\n");
  
  const agent = echos("devtools_demo");
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("1. Policy Testing (Dry-Run)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("Testing policy without running the agent...");
  const testPolicy = {
    allow: ["llm.chat:*", "http.request:GET*"],
    ask: ["email.send:*", "slack.post:*"],
    block: ["fs.delete:*", "db.drop:*"]
  };
  
  // Test allowed action
  const allowTest = await agent.testPolicy({
    intent: "llm.chat",
    target: "gpt-4",
    policy: testPolicy
  });
  console.log(`\n✅ llm.chat → ${allowTest.status}`);
  console.log(`   Rule: ${allowTest.rule}`);
  console.log(`   Message: ${allowTest.message}`);
  
  // Test ask action
  const askTest = await agent.testPolicy({
    intent: "email.send",
    target: "user@example.com",
    policy: testPolicy
  });
  console.log(`\n⚠️  email.send → ${askTest.status}`);
  console.log(`   Rule: ${askTest.rule}`);
  console.log(`   Message: ${askTest.message}`);
  
  // Test blocked action
  const blockTest = await agent.testPolicy({
    intent: "fs.delete",
    target: "/important/data",
    policy: testPolicy
  });
  console.log(`\n❌ fs.delete → ${blockTest.status}`);
  console.log(`   Rule: ${blockTest.rule}`);
  console.log(`   Message: ${blockTest.message}`);
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("2. Template Validation");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  // Valid template
  const validYaml = `
name: "Test Template"
version: 1
description: "A test policy template"
allow:
  - llm.chat:*
  - http.request:GET*
ask:
  - email.send:*
block:
  - fs.delete:*
`;
  
  console.log("Validating a correct YAML template...");
  const validResult = await agent.validateTemplate(validYaml);
  console.log(`\n✅ Valid: ${validResult.valid}`);
  if (validResult.warnings?.length) {
    console.log(`   Warnings: ${validResult.warnings.length}`);
  }
  
  // Invalid template
  const invalidYaml = `
name: "Broken Template"
allow:
  - [this is not valid yaml
block
  - something wrong
`;
  
  console.log("\nValidating an incorrect YAML template...");
  const invalidResult = await agent.validateTemplate(invalidYaml);
  console.log(`\n❌ Valid: ${invalidResult.valid}`);
  if (invalidResult.errors?.length) {
    console.log(`   Errors: ${invalidResult.errors.length}`);
    invalidResult.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err}`);
    });
  }
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("3. Webhook Management");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("Listing current webhooks...");
  let webhooks = await agent.listWebhooks();
  console.log(`\n📋 Current webhooks: ${webhooks.length}`);
  webhooks.forEach((url: string) => console.log(`   • ${url}`));
  
  console.log("\nAdding a new webhook...");
  const addResult = await agent.addWebhook("https://example.com/echos-webhook");
  if (addResult.ok) {
    console.log("✅ Webhook added successfully!");
    webhooks = addResult.webhooks || [];
    console.log(`   Total webhooks: ${webhooks.length}`);
  }
  
  console.log("\nRemoving the webhook...");
  const removeResult = await agent.removeWebhook("https://example.com/echos-webhook");
  if (removeResult.ok) {
    console.log("✅ Webhook removed successfully!");
    webhooks = removeResult.webhooks || [];
    console.log(`   Total webhooks: ${webhooks.length}`);
  }
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("4. Debug Mode");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("To enable debug mode, set the ECHOS_DEBUG environment variable:");
  console.log("\n   Daemon:  ECHOS_DEBUG=1 pnpm dev:daemon");
  console.log("   SDK:     ECHOS_DEBUG=1 node your-agent.js");
  console.log("\nDebug mode provides:");
  console.log("   • Detailed API request/response logs");
  console.log("   • Policy evaluation details");
  console.log("   • Token operation traces");
  console.log("   • Webhook notification logs");
  console.log("   • Enhanced error context");
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Developer Tools Demo Complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n💡 Visit http://localhost:3000/devtools for the visual interface");
  console.log("   • Test policies interactively");
  console.log("   • Validate YAML templates with instant feedback");
  console.log("   • Manage webhooks with copy buttons");
  console.log("\n");
}

main().catch(console.error);

