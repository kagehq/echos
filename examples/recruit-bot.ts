#!/usr/bin/env tsx
/**
 * RecruitBot - Automated candidate outreach
 * 
 * This bot reads a candidate database, drafts personalized emails,
 * and schedules follow-up meetings. It requires human approval for
 * each email sent and calendar event created.
 */

import { echos } from "@echos/sdk";

const agent = echos("RecruitBot");

async function recruitCandidates() {
  console.log("🤖 RecruitBot starting...\n");

  const candidates = [
    { name: "Alice Johnson", email: "alice@example.com", role: "Senior Engineer" },
    { name: "Bob Smith", email: "bob@example.com", role: "Product Manager" },
  ];

  for (const candidate of candidates) {
    try {
      // Read candidate profile (allowed by policy)
      await agent.emit("calendar.read", "/candidates", {
        candidate: candidate.name,
      });

      // Draft and send personalized email (requires approval)
      await agent.emit("email.send", candidate.email, {
        subject: `Exciting opportunity for ${candidate.role}`,
        body: `Hi ${candidate.name},\n\nWe have an exciting role...`,
      });

      console.log(`✅ Email sent to ${candidate.name}`);

      // Schedule follow-up meeting (requires approval)
      await agent.emit("calendar.write", "/primary", {
        title: `Interview: ${candidate.name}`,
        start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        duration: 60,
      });

      console.log(`📅 Meeting scheduled with ${candidate.name}\n`);
    } catch (err) {
      console.error(`❌ Failed for ${candidate.name}:`, err.message);
    }
  }

  console.log("✨ RecruitBot finished!");
}

recruitCandidates().catch(console.error);

