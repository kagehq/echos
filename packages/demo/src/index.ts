#!/usr/bin/env node
import { execa } from "execa";
import open from "open";
import waitPort from "wait-port";
import { echos } from "@echoshq/sdk";
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
  await agent.emit(
    "llm.chat", 
    "gpt-4", 
    { prompt:"Analyze sales data" },
    { model: "gpt-4", temperature: 0.7, max_tokens: 500 },
    { choices: [{ message: { content: "Sales analysis complete..." }}], usage: { total_tokens: 142 }},
    { latency: "850ms", cost: "$0.002" }
  );
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log("2️⃣  Slack post → Should ASK for permission");
  console.log("   💡 Check dashboard - consent modal should appear!");
  try { 
    await agent.emit(
      "slack.post", 
      "#sales", 
      { text:"Q4 results ready" },
      { channel: "#sales", text: "Q4 results ready", as_user: true },
      { ok: true, channel: "C1234567890", ts: "1729000000.123456" },
      { retry_count: 0 }
    ); 
    console.log("   ✅ Action allowed");
  } catch (err) { 
    console.log("   ❌ Action denied or timed out");
  }
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log("3️⃣  File delete → Should be BLOCKED by policy");
  try { 
    await agent.emit(
      "fs.delete", 
      "/tmp/cache.db",
      { force: true },
      { path: "/tmp/cache.db", recursive: false },
      null,
      { would_delete: "500MB" }
    ); 
  } catch (err) { 
    console.log("   ❌ Action blocked by policy (expected)");
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 2: Roles & Templates");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("4️⃣  Listing available policy templates...");
  const templates = await agent.listTemplates();
  console.log(`   ✅ Found ${templates.length} templates: ${templates.map((t: any) => t.id).join(", ")}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("5️⃣  Applying 'research_assistant' role to demo_bot...");
  const roleResult = await agent.applyRole({ 
    template: "research_assistant",
    overrides: { allow: ["calendar.write:*"] }
  });
  if (roleResult?.ok) {
    console.log("   ✅ Role applied successfully!");
    console.log(`   📋 Policy: ${roleResult.policy?.allow?.length || 0} allow, ${roleResult.policy?.ask?.length || 0} ask, ${roleResult.policy?.block?.length || 0} block rules`);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log("6️⃣  Checking current policy...");
  const policy = await agent.getPolicy();
  console.log(`   ✅ Agent policy: template=${policy.template || 'none'}, ${policy.allow?.length || 0} allow rules`);
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 3: Token-Based Authorization");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("7️⃣  First calendar access → will ASK for permission");
  console.log("   💡 In the dashboard, click 'Allow 1h' to grant a token!");
  try {
    await agent.emit(
      "calendar.read", 
      "team-calendar",
      { timeMin: "2025-01-01T00:00:00Z" },
      { calendar: "team-calendar", query: "meetings" },
      { events: [{ id: "evt_123", summary: "Q4 Review", start: "2025-01-15T10:00:00Z" }]},
      { event_count: 3 }
    );
    console.log("   ✅ First action approved!");
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // If we got here, the user granted a token via "Allow 1h"
    console.log("8️⃣  Second calendar access → using the token");
    await agent.emit(
      "calendar.write", 
      "team-calendar", 
      { title: "Q4 Planning" },
      { summary: "Q4 Planning", start: "2025-01-20T14:00:00Z", attendees: ["team@company.com"] },
      { created: true, event_id: "evt_456", html_link: "https://calendar.google.com/event?eid=..." },
      { attendee_count: 5 }
    );
    console.log("   ✅ No consent needed - token was used!");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("9️⃣  Third calendar access → still using the same token");
    await agent.emit(
      "calendar.read", 
      "shared-calendar",
      {},
      { calendar: "shared-calendar" },
      { events: [{ id: "evt_789", summary: "Team Standup" }]},
      { event_count: 1 }
    );
    console.log("   ✅ All subsequent actions use the same token!");
  } catch (err) {
    console.log("   ❌ Action was denied");
  }
  
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Demo complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📊 Check the dashboard:");
  console.log("   • Feed: See all events in real-time with live WebSocket updates");
  console.log("   • Timeline: Review historical actions - click events to expand!");
  console.log("   • Metrics: View performance analytics and activity charts");
  console.log("   • Roles: Manage policy templates and view applied roles (we just applied one!)");
  console.log("   • Event Details: Click any event to see request/response/metadata");
  console.log("   • Policy Transparency: See which rule matched for each decision");
  console.log("   • Tokens: Manage active authorizations");
  console.log("\n⌨️  Press Ctrl+C to stop all services.\n");

  process.on("SIGINT", () => { 
    daemon.kill("SIGINT"); 
    dash.kill("SIGINT"); 
    process.exit(0);
  });
}

run().catch(console.error);

