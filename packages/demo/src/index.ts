#!/usr/bin/env node
import { execa } from "execa";
import open from "open";
import waitPort from "wait-port";
import { echos } from "@echos/sdk";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "../../..");

async function run() {
  console.log("🔊 Starting Echos demo...\n");
  
  // start daemon (dev)
  console.log("Starting daemon...");
  const daemon = execa("pnpm", ["-C", join(root, "apps/daemon"), "dev"], { stdio: "inherit" });
  
  // start dashboard
  console.log("Starting dashboard...");
  const dash = execa("pnpm", ["-C", join(root, "apps/dashboard"), "dev"], { stdio: "inherit" });
  
  // Wait for daemon to be ready
  await waitPort({ host: "127.0.0.1", port: 3434, timeout: 10000 });
  console.log("✅ Daemon ready on http://127.0.0.1:3434");
  
  // Wait a bit for dashboard
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log("✅ Dashboard starting on http://localhost:3000");
  
  // Open browser
  await open("http://localhost:3000");
  console.log("🌐 Opening dashboard in browser...\n");
  
  // Give dashboard time to load
  await new Promise(resolve => setTimeout(resolve, 2000));

  // demo agent
  console.log("🤖 Running demo agent actions...\n");
  const agent = echos("demo_bot");
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 1: Individual Actions (no token)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("1️⃣  LLM chat → Should be ALLOWED by policy");
  await agent.emit("llm.chat", "gpt-4", { prompt:"Analyze sales data" });
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log("2️⃣  Slack post → Should ASK for permission");
  console.log("   💡 Check dashboard - consent modal should appear!");
  try { 
    await agent.emit("slack.post", "#sales", { text:"Q4 results ready" }); 
    console.log("   ✅ Action allowed");
  } catch (err) { 
    console.log("   ❌ Action denied or timed out");
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log("3️⃣  File delete → Should be BLOCKED by policy");
  try { 
    await agent.emit("fs.delete", "/tmp/cache.db"); 
  } catch (err) { 
    console.log("   ❌ Action blocked by policy (expected)");
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 2: Token-Based Authorization");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("4️⃣  First calendar access → will ASK for permission");
  console.log("   💡 In the dashboard, click 'Allow 1h' to grant a token!");
  try {
    await agent.emit("calendar.read", "team-calendar");
    console.log("   ✅ First action approved!");
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // If we got here, the user granted a token via "Allow 1h"
    console.log("5️⃣  Second calendar access → using the token");
    await agent.emit("calendar.write", "team-calendar", { title: "Q4 Planning" });
    console.log("   ✅ No consent needed - token was used!");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("6️⃣  Third calendar access → still using the same token");
    await agent.emit("calendar.read", "shared-calendar");
    console.log("   ✅ All subsequent actions use the same token!");
  } catch (err) {
    console.log("   ❌ Action was denied");
  }
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Demo complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📊 Check the dashboard:");
  console.log("   • Feed: See all events in real-time");
  console.log("   • Timeline: Review historical actions");
  console.log("   • Tokens: Manage active authorizations");
  console.log("\n⌨️  Press Ctrl+C to stop all services.\n");

  process.on("SIGINT", () => { 
    daemon.kill("SIGINT"); 
    dash.kill("SIGINT"); 
    process.exit(0);
  });
}

run().catch(console.error);

