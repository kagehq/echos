/**
 * LangChain.js Integration Example
 * 
 * Shows how to add Echos governance to LangChain.js agents.
 * Install: npm install langchain @langchain/openai
 */

import { DynamicTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { echos } from "@echoshq/sdk";

// Create Echos client for governance
const agent = echos("langchain-sales-assistant");

// Example: Email sending tool with Echos governance
const sendEmailTool = new DynamicTool({
  name: "send_email",
  description: "Send an email to a customer or team member. Input should be JSON with 'to', 'subject', and 'body' fields.",
  func: async (input: string) => {
    try {
      const { to, subject, body } = JSON.parse(input);
      
      // Echos policy check - blocks, asks, or allows based on your policy
      await agent.emit(
        "email.send",
        to,
        { subject },
        { body }
      );
      
      // Only reaches here if policy allows
      console.log(`[Simulated] Sending email to ${to}: ${subject}`);
      return `✓ Email sent to ${to}`;
    } catch (error: any) {
      return `✗ Email blocked: ${error.message}`;
    }
  },
});

// Example: Database query tool with read-only enforcement
const queryDatabaseTool = new DynamicTool({
  name: "query_database",
  description: "Query the customer database. Input should be a SQL query string.",
  func: async (query: string) => {
    try {
      // Echos checks if query is allowed (e.g., block DELETE/DROP)
      await agent.emit(
        "db.query",
        query,
        { queryType: query.trim().split(/\s+/)[0].toUpperCase() }
      );
      
      // Simulate database query
      console.log(`[Simulated] Executing query: ${query}`);
      return `✓ Query executed: 42 rows returned`;
    } catch (error: any) {
      return `✗ Query blocked: ${error.message}`;
    }
  },
});

// Example: Slack posting tool with channel restrictions
const postToSlackTool = new DynamicTool({
  name: "post_to_slack",
  description: "Post a message to a Slack channel. Input should be JSON with 'channel' and 'message' fields.",
  func: async (input: string) => {
    try {
      const { channel, message } = JSON.parse(input);
      
      // Echos checks channel permissions
      await agent.emit(
        "slack.post",
        channel,
        { messagePreview: message.substring(0, 100) }
      );
      
      console.log(`[Simulated] Posting to ${channel}: ${message}`);
      return `✓ Posted to ${channel}`;
    } catch (error: any) {
      return `✗ Slack post blocked: ${error.message}`;
    }
  },
});

// Create LangChain agent with governed tools
async function runLangChainAgent() {
  const model = new ChatOpenAI({
    modelName: "gpt-4",
    temperature: 0,
  });

  const tools = [sendEmailTool, queryDatabaseTool, postToSlackTool];

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful sales assistant. You can send emails, query the database, and post to Slack."],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const langchainAgent = await createOpenAIFunctionsAgent({
    llm: model,
    tools,
    prompt,
  });

  const executor = new AgentExecutor({
    agent: langchainAgent,
    tools,
    verbose: true,
  });

  // Example: This will trigger Echos policy checks
  console.log("\n--- Example 1: Send follow-up email ---");
  const result1 = await executor.invoke({
    input: "Send a follow-up email to john@example.com thanking them for their purchase",
  });
  console.log(result1.output);

  // Example: Database query (allowed if read-only)
  console.log("\n--- Example 2: Query database ---");
  const result2 = await executor.invoke({
    input: "Query the database to find our top 5 customers by revenue",
  });
  console.log(result2.output);

  // Example: Slack post (might require approval based on channel)
  console.log("\n--- Example 3: Post to Slack ---");
  const result3 = await executor.invoke({
    input: "Post a message to #sales-team channel about today's wins",
  });
  console.log(result3.output);
}

// Policy for this agent (create in dashboard or templates/langchain_sales.yaml):
const EXAMPLE_POLICY = `
name: "LangChain Sales Assistant"
description: "Sales agent with email and database access"

allow:
  - "db.query:SELECT*"           # Allow read-only queries
  - "slack.post:#sales-*"        # Allow posting to sales channels

ask:
  - "email.send:*@*"             # Review all emails before sending
  - "slack.post:*"               # Ask for other channels

block:
  - "db.query:DELETE*"           # Block destructive queries
  - "db.query:DROP*"
  - "db.query:UPDATE*"
  - "email.send:*@competitor.com" # Block competitor emails
`;

console.log("📋 Example Policy:");
console.log(EXAMPLE_POLICY);

// Run the example
if (process.env.OPENAI_API_KEY) {
  runLangChainAgent().catch(console.error);
} else {
  console.log("\n⚠️  Set OPENAI_API_KEY to run this example");
  console.log("This example shows how Echos integrates with LangChain.js agents");
}

