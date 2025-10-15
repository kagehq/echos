/**
 * YOUR FIRST AUTONOMOUS AGENT
 * 
 * If you're coming from interactive AI tools (Cursor, Claude, etc.) and want
 * to build your first autonomous agent - start here!
 * 
 * This example shows a simple scheduled bot that you can run autonomously.
 */

import { echos } from "@echoshq/sdk";

// Create your agent
const agent = echos("my-first-agent");

// Apply a safe template - this auto-allows some actions, requires approval for others
await agent.applyRole({ 
  template: "research_assistant",
  overrides: { 
    ask: ["slack.post:.*"]  // We'll approve Slack posts manually at first
  }
});

console.log("🤖 Starting my first autonomous agent...\n");

// Example 1: Safe action (auto-allowed by research_assistant template)
console.log("📝 Asking an LLM a question...");
await agent.emit("llm.chat", "gpt-4", {
  prompt: "What's the weather today?"
});
console.log("✅ LLM call completed (auto-allowed)\n");

// Example 2: Requires approval (we added it to 'ask')
console.log("💬 Trying to post to Slack...");
try {
  await agent.emit("slack.post", "#general", {
    text: "Hello from my first autonomous agent!"
  });
  console.log("✅ Slack post approved and sent!\n");
} catch (err) {
  console.log("❌ Slack post was denied\n");
}

// Example 3: Blocked by default (dangerous action)
console.log("🚨 Trying to delete a file...");
try {
  await agent.emit("fs.delete", "/tmp/test.txt", {
    reason: "Cleanup"
  });
  console.log("✅ File deletion completed\n");
} catch (err) {
  console.log("❌ File deletion blocked by policy (good!)\n");
}

console.log("🎉 Your first agent is complete!");
console.log("\n💡 Next steps:");
console.log("   • Check the dashboard at http://localhost:3000");
console.log("   • Try modifying the policy in ~/.echos/echos.yaml");
console.log("   • Build something useful - see examples/ for ideas!");

