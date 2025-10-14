#!/usr/bin/env tsx
/**
 * CodeReviewer - Automated PR review and feedback
 * 
 * This bot reviews pull requests using LLM, posts comments,
 * and sends email summaries. HTTP requests to GitHub API
 * and email sending require human approval.
 */

import { echos } from "@echos/sdk";

const agent = echos("CodeReviewer");

interface PullRequest {
  id: number;
  title: string;
  author: string;
  files: string[];
}

async function reviewPR(pr: PullRequest) {
  console.log(`🔍 Reviewing PR #${pr.id}: ${pr.title}`);

  try {
    // Fetch PR details from GitHub (requires approval for http.request)
    await agent.emit("http.request", `https://api.github.com/pulls/${pr.id}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    console.log(`  ✅ Fetched PR details`);

    // Use LLM to analyze code (auto-allowed)
    await agent.emit("llm.chat", "openai.chat", {
      prompt: `Review this PR: ${pr.title}\nFiles: ${pr.files.join(", ")}`,
      model: "gpt-4",
    });
    console.log(`  ✅ LLM analysis complete`);

    // Post review comment to Slack (requires approval)
    await agent.emit("slack.post", "#engineering", {
      text: `📝 PR #${pr.id} reviewed: ${pr.title}\n✨ LGTM with minor suggestions`,
    });
    console.log(`  ✅ Posted to Slack`);

    // Send summary email to author (requires approval)
    await agent.emit("email.send", `${pr.author}@company.com`, {
      subject: `PR Review: ${pr.title}`,
      body: `Hi ${pr.author},\n\nI've reviewed your PR...`,
    });
    console.log(`  ✅ Email sent to ${pr.author}\n`);
  } catch (err) {
    console.error(`❌ Failed for PR #${pr.id}:`, err.message);
  }
}

async function run() {
  console.log("🤖 CodeReviewer starting...\n");

  const prs = [
    {
      id: 123,
      title: "Add user authentication",
      author: "alice",
      files: ["auth.ts", "middleware.ts"],
    },
    {
      id: 124,
      title: "Fix memory leak in cache",
      author: "bob",
      files: ["cache.ts", "utils.ts"],
    },
  ];

  for (const pr of prs) {
    await reviewPR(pr);
  }

  console.log("✨ CodeReviewer finished!");
}

run().catch(console.error);

