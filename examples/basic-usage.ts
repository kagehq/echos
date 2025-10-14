/**
 * Echos SDK - Basic Usage Example
 * 
 * This example shows how to integrate Echos into your AI agent code.
 */

import { echos } from "@echoshq/sdk";

async function main() {
  // Create a client for your agent
  const ak = echos("my_awesome_agent");

  console.log("Starting agent actions...\n");

  // Example 1: LLM Chat (typically allowed by default)
  console.log("1. Calling LLM API...");
  try {
    await ak.emit("llm.chat", "openai.chat", {
      model: "gpt-4",
      prompt: "Summarize the quarterly report"
    });
    console.log("   ✅ LLM call allowed\n");
  } catch (err) {
    console.log(`   ❌ LLM call blocked: ${err.message}\n`);
  }

  // Example 2: HTTP Request
  console.log("2. Making HTTP request...");
  try {
    await ak.emit("http.request", "https://api.example.com/data", {
      method: "GET",
      headers: { "Authorization": "Bearer ..." }
    });
    console.log("   ✅ HTTP request allowed\n");
  } catch (err) {
    console.log(`   ❌ HTTP request blocked: ${err.message}\n`);
  }

  // Example 3: Slack Post (typically requires user confirmation)
  console.log("3. Posting to Slack...");
  try {
    await ak.emit("slack.post", "#general", {
      text: "🤖 Quarterly report summary is ready!",
      blocks: []
    });
    console.log("   ✅ Slack post sent\n");
  } catch (err) {
    console.log(`   ❌ Slack post denied: ${err.message}\n`);
  }

  // Example 4: File Delete (typically blocked by default)
  console.log("4. Deleting file...");
  try {
    await ak.emit("fs.delete", "/tmp/old-data.json");
    console.log("   ✅ File deletion allowed\n");
  } catch (err) {
    console.log(`   ❌ File deletion blocked: ${err.message}\n`);
  }

  // Example 5: Email Send
  console.log("5. Sending email...");
  try {
    await ak.emit("email.send", "team@company.com", {
      subject: "Weekly Report",
      body: "Here's your weekly summary...",
      attachments: []
    });
    console.log("   ✅ Email sent\n");
  } catch (err) {
    console.log(`   ❌ Email blocked: ${err.message}\n`);
  }

  console.log("Agent actions completed!");
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };

