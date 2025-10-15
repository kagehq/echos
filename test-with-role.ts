import { echos } from "@echoshq/sdk";

const agent = echos("my_test_agent");

async function main() {
  console.log("Applying role...");
  
  // Apply a policy template
  await agent.applyRole({ template: "internal_notifier" });
  
  console.log("✅ Role applied!");
  console.log("Check the Active Agents view in VSCode extension!");
  
  // Keep script running so you can see it in the view
  await new Promise(resolve => setTimeout(resolve, 30000));
}

main().catch(console.error);

