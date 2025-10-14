#!/usr/bin/env tsx
/**
 * SalesBot - Automated deal updates and notifications
 * 
 * This bot monitors deals, sends Slack notifications when deals progress,
 * and uses LLM to draft follow-up messages. Slack posts require approval,
 * while LLM chats are auto-allowed.
 */

import { echos } from "@echos/sdk";

const agent = echos("SalesBot");

// Request long-lived token for Slack notifications (1 hour)
async function setup() {
  await agent.authorize({
    scopes: ["slack.post", "llm.chat"],
    durationSec: 3600,
    reason: "Daily sales notifications",
  });
  console.log("🔑 Authorized for Slack + LLM\n");
}

async function processDeal(deal: { name: string; stage: string; value: number }) {
  console.log(`📊 Processing deal: ${deal.name}`);

  // Use LLM to draft a follow-up message (auto-allowed)
  const prompt = `Draft a friendly follow-up message for ${deal.name} (${deal.stage}, $${deal.value})`;
  await agent.emit("llm.chat", "claude.messages", { prompt });
  console.log(`  ✅ LLM drafted follow-up`);

  // Post update to Slack (may require approval on first run)
  await agent.emit("slack.post", "#sales", {
    text: `🎉 Deal update: *${deal.name}* moved to ${deal.stage} ($${deal.value.toLocaleString()})`,
  });
  console.log(`  ✅ Posted to Slack\n`);
}

async function run() {
  await setup();

  const deals = [
    { name: "Acme Corp", stage: "Negotiation", value: 50000 },
    { name: "TechStart Inc", stage: "Closed Won", value: 120000 },
  ];

  for (const deal of deals) {
    try {
      await processDeal(deal);
    } catch (err) {
      console.error(`❌ Failed for ${deal.name}:`, err.message);
    }
  }

  console.log("✨ SalesBot finished!");
}

run().catch(console.error);

