import { echos } from "@echoshq/sdk";

const agent = echos("extension_test");

async function main() {
  console.log("Testing VSCode extension approval flow...");
  
  // This should trigger an approval notification in VSCode
  try {
    await agent.emit("slack.post", "#test", { 
      text: "Testing from extension!" 
    });
    console.log("✅ Action approved!");
  } catch (err) {
    console.log("❌ Action denied:", err);
  }
}

main().catch(console.error);

