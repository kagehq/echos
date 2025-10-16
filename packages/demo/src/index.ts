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
    { 
      latency: "850ms", 
      costUsd: 0.002, 
      cost: { usd: 0.002 }, 
      provider: "openai",
      // Enhanced metadata for demo
      customerId: "demo_customer_123",
      subscriptionId: "demo_sub_456", 
      feature: "sales_analysis",
      environment: "demo",
      duration: 850,
      tokensUsed: 142,
      modelVersion: "gpt-4-1106-preview",
      correlationId: "demo_corr_001"
    }
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
      { 
        retry_count: 0,
        // Enhanced metadata for demo
        customerId: "demo_customer_123",
        subscriptionId: "demo_sub_456",
        feature: "team_notifications",
        environment: "demo",
        duration: 1200,
        correlationId: "demo_corr_002"
      }
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
      { 
        would_delete: "500MB",
        // Enhanced metadata for demo
        customerId: "demo_customer_123",
        subscriptionId: "demo_sub_456",
        feature: "cache_cleanup",
        environment: "demo",
        correlationId: "demo_corr_003"
      }
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
  console.log("PHASE 3: Spend Capping & User Management");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("💰 Creating users with spend caps...");
  try {
    // Create a user with spend limits
    const userResponse = await fetch("http://127.0.0.1:3434/roles/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "demo-capped-user",
        template: "capped_user",
        overrides: {
          limits: {
            ai_daily_usd: 5.00,
            ai_monthly_usd: 100.00,
            llm_daily_usd: 3.00,
            llm_monthly_usd: 60.00
          }
        }
      })
    });
    
    if (userResponse.ok) {
      console.log("   ✅ User created with spend caps:");
      console.log("   💵 Daily limit: $5.00 (LLM: $3.00)");
      console.log("   💵 Monthly limit: $100.00 (LLM: $60.00)");
    }
    
    // Issue API key for the capped user
    const tokenResponse = await fetch("http://127.0.0.1:3434/tokens/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "demo-capped-user",
        scopes: ["llm.chat", "http.request"],
        durationSec: 3600,
        reason: "Demo user with spend caps",
        createdBy: "demo@company.com",
        createdReason: "Demonstrating spend capping",
        customerId: "demo_customer_spend",
        subscriptionId: "demo_sub_spend"
      })
    });
    
    if (tokenResponse.ok) {
      console.log("   ✅ API key issued for capped user");
    }
    
  } catch (err) {
    console.log("   ⚠️  User creation failed (daemon may not be ready)");
  }
  
  console.log("\n💸 Simulating spend to test limits...");
  try {
    // Simulate some spending
    const spendEvents = [
      { costUsd: 1.50, description: "First LLM call" },
      { costUsd: 2.00, description: "Second LLM call" },
      { costUsd: 0.75, description: "Third LLM call (should hit daily limit)" }
    ];
    
    for (const [index, event] of spendEvents.entries()) {
      const eventResponse = await fetch("http://127.0.0.1:3434/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "demo-capped-user",
          intent: "llm.chat",
          target: "gpt-4",
          ts: Date.now(),
          costUsd: event.costUsd,
          customerId: "demo_customer_spend",
          subscriptionId: "demo_sub_spend",
          feature: "chat_completion",
          environment: "demo",
          duration: 1000 + (index * 200),
          tokensUsed: 1000 + (index * 500),
          modelVersion: "gpt-4-1106-preview",
          correlationId: `demo_spend_${index + 1}`
        })
      });
      
      if (eventResponse.ok) {
        console.log(`   ✅ ${event.description}: $${event.costUsd} spent`);
      }
    }
    
    // Check current spend
    const metricsResponse = await fetch("http://127.0.0.1:3434/metrics/llm");
    const metrics = await metricsResponse.json() as any;
    const userSpend = metrics.summary.find((s: any) => s.agent === "demo-capped-user");
    
    if (userSpend) {
      console.log(`   📊 Current spend: $${userSpend.dailyUsd.toFixed(2)}/day, $${userSpend.monthlyUsd.toFixed(2)}/month`);
      console.log(`   📊 LLM spend: $${userSpend.llmDailyUsd.toFixed(2)}/day, $${userSpend.llmMonthlyUsd.toFixed(2)}/month`);
      
      if (userSpend.dailyUsd >= 5.00) {
        console.log("   🚨 Daily limit reached! Next LLM call will be blocked.");
      }
    }
    
  } catch (err) {
    console.log("   ⚠️  Spend simulation failed (daemon may not be ready)");
  }
  
  console.log("\n🔒 Testing spend limit enforcement...");
  try {
    // Try to make a request that should be blocked due to spend limits
    const decideResponse = await fetch("http://127.0.0.1:3434/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "demo-capped-user",
        intent: "llm.chat",
        target: "gpt-4",
        costUsd: 1.00 // This should be blocked if we've hit the limit
      })
    });
    
    const decision = await decideResponse.json() as any;
    if (decision.status === "block") {
      console.log("   🚫 Request blocked by spend limits (expected)");
      console.log(`   📋 Reason: ${decision.message}`);
    } else {
      console.log("   ✅ Request allowed (limits not yet reached)");
    }
    
  } catch (err) {
    console.log("   ⚠️  Limit enforcement test failed");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 4: Enhanced Metadata Demo");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("📊 Creating user with enhanced metadata...");
  try {
    // Create a user with business context
    const userResponse = await fetch("http://127.0.0.1:3434/tokens/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "demo-enhanced-user",
        scopes: ["llm.chat", "http.request"],
        durationSec: 3600,
        reason: "Enhanced metadata demonstration",
        createdBy: "demo@company.com",
        createdReason: "Demo user for enhanced tracking",
        customerId: "demo_customer_123",
        subscriptionId: "demo_sub_456"
      })
    });
    
    if (userResponse.ok) {
      console.log("   ✅ User created with business context");
      console.log("   📋 Customer ID: demo_customer_123");
      console.log("   📋 Subscription: demo_sub_456");
    }
  } catch (err) {
    console.log("   ⚠️  User creation failed (daemon may not be ready)");
  }
  
  console.log("\n📊 Recording event with comprehensive metadata...");
  try {
    const eventResponse = await fetch("http://127.0.0.1:3434/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "demo-enhanced-user",
        intent: "llm.chat",
        target: "gpt-4",
        ts: Date.now(),
        costUsd: 0.75,
        // Business context
        customerId: "demo_customer_123",
        subscriptionId: "demo_sub_456",
        feature: "chat_completion",
        environment: "demo",
        // Performance metrics
        duration: 1250,
        tokensUsed: 1500,
        modelVersion: "gpt-4-1106-preview",
        latency: 1200,
        // Audit trail
        userAgent: "EchosDemo/1.0",
        ipAddress: "192.168.1.100",
        sessionId: "sess_demo_789",
        correlationId: "demo_corr_enhanced_001",
        // Request/response data
        request: {
          messages: [{ role: "user", content: "Hello, how are you?" }],
          model: "gpt-4",
          temperature: 0.7
        },
        response: {
          choices: [{
            message: { role: "assistant", content: "I am doing well, thank you!" },
            finish_reason: "stop"
          }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
        }
      })
    });
    
    if (eventResponse.ok) {
      console.log("   ✅ Event recorded with comprehensive metadata");
      console.log("   📊 Performance: 1250ms duration, 1500 tokens");
      console.log("   🔍 Audit: IP 192.168.1.100, correlation demo_corr_enhanced_001");
      console.log("   💼 Business: Customer demo_customer_123, Feature chat_completion");
    }
  } catch (err) {
    console.log("   ⚠️  Event recording failed (daemon may not be ready)");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 4: Token-Based Authorization");
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
  console.log("\n📊 Check the dashboard at http://localhost:3000:");
  console.log("   • Feed: Real-time events with search, filtering, and copy buttons");
  console.log("   • Timeline: Historical audit log with expandable details + enhanced metadata");
  console.log("   • Metrics: Performance analytics and activity charts");
  console.log("   • Roles: Manage policy templates and role assignments");
  console.log("   • DevTools: Test policies, validate YAML, manage webhooks");
  console.log("   • Tokens: View and manage active authorizations");
  console.log("\n💰 Spend Capping Features:");
  console.log("   • Individual User Limits: Daily/monthly spend caps per user");
  console.log("   • Automatic Enforcement: Real-time blocking when limits hit");
  console.log("   • Granular Control: LLM-specific vs total AI spend limits");
  console.log("   • Business Context: Customer ID, subscription tracking");
  console.log("   • Real-time Monitoring: Live spend tracking in dashboard");
  
  console.log("\n🔍 Enhanced Metadata Features:");
  console.log("   • Business Context: Customer ID, subscription, feature, environment");
  console.log("   • Performance: Duration, tokens used, model version, latency");
  console.log("   • Audit Trail: IP addresses, user agents, correlation IDs");
  console.log("   • User Attribution: Who created users and why");
  console.log("\n⌨️  Press Ctrl+C to stop all services.\n");

  process.on("SIGINT", () => { 
    daemon.kill("SIGINT"); 
    dash.kill("SIGINT"); 
    process.exit(0);
  });
}

run().catch(console.error);

