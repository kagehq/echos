/**
 * Echos SDK - Roles & Templates Example
 * 
 * This example demonstrates how to use the roles and templates system
 * to manage agent policies programmatically.
 */

import { echos } from "@echoshq/sdk";

async function main() {
  const agent = echos("research_bot");

  console.log("🎭 Echos Roles & Templates Demo\n");

  // 1. List available templates
  console.log("1️⃣  Listing available policy templates...");
  const templates = await agent.listTemplates();
  console.log(`   Found ${templates.length} templates:\n`);
  templates.forEach(t => {
    console.log(`   📋 ${t.id} (v${t.version})`);
    console.log(`      ${t.description}`);
    console.log(`      Allow: ${t.allow.length} rules`);
    console.log(`      Ask: ${t.ask.length} rules`);
    console.log(`      Block: ${t.block.length} rules\n`);
  });

  // 2. Apply a role to your agent
  console.log("2️⃣  Applying 'research_assistant' template...");
  const result = await agent.applyRole({ 
    template: "research_assistant",
    // Optional: add custom overrides
    overrides: { 
      allow: ["calendar.write:*"]  // Override to allow calendar writes
    }
  });

  if (result?.ok) {
    console.log("   ✅ Role applied successfully!");
    console.log(`   Policy includes:`);
    console.log(`      • ${result.policy?.allow?.length || 0} allow rules`);
    console.log(`      • ${result.policy?.ask?.length || 0} ask rules`);
    console.log(`      • ${result.policy?.block?.length || 0} block rules\n`);
  } else {
    console.log(`   ❌ Failed to apply role: ${result?.error}\n`);
  }

  // 3. Check current policy for your agent
  console.log("3️⃣  Checking current policy...");
  const policy = await agent.getPolicy();
  console.log(`   Template: ${policy.template || 'none'}`);
  console.log(`   Applied at: ${policy.appliedAt ? new Date(policy.appliedAt).toLocaleString() : 'N/A'}`);
  console.log(`   Allow rules: ${policy.allow?.slice(0, 3).join(", ")}${policy.allow?.length > 3 ? '...' : ''}`);
  console.log(`   Block rules: ${policy.block?.slice(0, 3).join(", ")}${policy.block?.length > 3 ? '...' : ''}\n`);

  // 4. List all role assignments
  console.log("4️⃣  Listing all role assignments...");
  const roles = await agent.listRoles();
  console.log(`   Found ${roles.length} agents with roles:\n`);
  roles.forEach(r => {
    console.log(`   🤖 ${r.agentId}`);
    console.log(`      Template: ${r.template}`);
    console.log(`      Applied: ${new Date(r.appliedAt).toLocaleString()}\n`);
  });

  // 5. Test the policy with actual actions
  console.log("5️⃣  Testing actions with the applied policy...\n");
  
  console.log("   Testing LLM chat (should be allowed)...");
  try {
    await agent.emit("llm.chat", "openai", { prompt: "Research latest AI papers" });
    console.log("   ✅ LLM chat allowed\n");
  } catch (err) {
    console.log(`   ❌ LLM chat blocked: ${err.message}\n`);
  }

  console.log("   Testing HTTP GET (should be allowed)...");
  try {
    await agent.emit("http.request", "https://arxiv.org/api/query", { method: "GET" });
    console.log("   ✅ HTTP GET allowed\n");
  } catch (err) {
    console.log(`   ❌ HTTP GET blocked: ${err.message}\n`);
  }

  console.log("   Testing email send (should be blocked)...");
  try {
    await agent.emit("email.send", "user@example.com", { subject: "Report" });
    console.log("   ✅ Email send allowed\n");
  } catch (err) {
    console.log(`   ❌ Email send blocked (expected): ${err.message}\n`);
  }

  console.log("   Testing file delete (should be blocked)...");
  try {
    await agent.emit("fs.delete", "/tmp/data.json");
    console.log("   ✅ File delete allowed\n");
  } catch (err) {
    console.log(`   ❌ File delete blocked (expected): ${err.message}\n`);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Roles & Templates demo complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n💡 Tips:");
  console.log("   • Create custom templates in apps/daemon/templates/");
  console.log("   • Templates hot-reload automatically");
  console.log("   • Role assignments persist across daemon restarts");
  console.log("   • Check the dashboard at http://localhost:3000/roles");
  console.log("   • Use overrides to customize templates per agent\n");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };

