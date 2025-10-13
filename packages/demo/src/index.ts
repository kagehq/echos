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
  const ak = echos("demo_bot");
  
  console.log("1. Emitting LLM chat (should be allowed)...");
  await ak.emit("llm.chat", "openai.chat", { prompt:"hello" });
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("2. Emitting Slack post (should ask for permission)...");
  try { 
    await ak.emit("slack.post", "#sales", { text:"hi!" }); 
  } catch (err) { 
    console.log("   → Action was denied or timed out");
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("3. Emitting file delete (should be blocked)...");
  try { 
    await ak.emit("fs.delete", "/var/data"); 
  } catch (err) { 
    console.log("   → Action was blocked by policy");
  }
  
  console.log("\n✅ Demo complete! Check the dashboard for live events.");
  console.log("Press Ctrl+C to stop all services.");

  process.on("SIGINT", () => { 
    daemon.kill("SIGINT"); 
    dash.kill("SIGINT"); 
    process.exit(0);
  });
}

run().catch(console.error);

