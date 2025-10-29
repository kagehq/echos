/**
 * Vercel AI SDK Integration Example
 * 
 * Shows how to add Echos governance to Vercel AI SDK agents.
 * Install: npm install ai @ai-sdk/openai zod
 */

import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { echos } from '@echoshq/sdk';

// Create Echos client
const agent = echos('vercel-ai-assistant');

// Define tools with Echos governance
const sendEmailTool = tool({
  description: 'Send an email to a recipient',
  parameters: z.object({
    to: z.string().email().describe('Email recipient'),
    subject: z.string().describe('Email subject'),
    body: z.string().describe('Email body'),
  }),
  execute: async ({ to, subject, body }) => {
    try {
      // Echos governance check
      await agent.emit('email.send', to, { subject }, { body });
      
      // Simulate sending email
      console.log(`[Simulated] Sending email to ${to}`);
      return { success: true, message: `Email sent to ${to}` };
    } catch (error: any) {
      return { success: false, message: `Blocked: ${error.message}` };
    }
  },
});

const searchWebTool = tool({
  description: 'Search the web for information',
  parameters: z.object({
    query: z.string().describe('Search query'),
  }),
  execute: async ({ query }) => {
    try {
      // Echos governance check
      await agent.emit('web.search', query);
      
      // Simulate web search
      console.log(`[Simulated] Searching web: ${query}`);
      return { 
        success: true, 
        results: [
          { title: 'Example Result', snippet: 'This is a sample result' }
        ]
      };
    } catch (error: any) {
      return { success: false, message: `Blocked: ${error.message}` };
    }
  },
});

const executeCodeTool = tool({
  description: 'Execute code in a sandbox',
  parameters: z.object({
    code: z.string().describe('Code to execute'),
    language: z.enum(['javascript', 'python']).describe('Programming language'),
  }),
  execute: async ({ code, language }) => {
    try {
      // Echos governance check - typically would block or require approval
      await agent.emit('code.execute', `${language}:${code.substring(0, 100)}`);
      
      console.log(`[Simulated] Executing ${language} code`);
      return { success: true, output: 'Code executed successfully' };
    } catch (error: any) {
      return { success: false, message: `Blocked: ${error.message}` };
    }
  },
});

// Example usage
async function runVercelAIAgent() {
  const result = await generateText({
    model: openai('gpt-4-turbo'),
    tools: {
      sendEmail: sendEmailTool,
      searchWeb: searchWebTool,
      executeCode: executeCodeTool,
    },
    maxSteps: 5,
    prompt: 'Search for the latest AI news and send a summary email to team@company.com',
  });

  console.log('\n--- Agent Response ---');
  console.log(result.text);
  
  console.log('\n--- Tool Calls ---');
  result.steps.forEach((step, i) => {
    if (step.toolCalls && step.toolCalls.length > 0) {
      console.log(`Step ${i + 1}:`, step.toolCalls);
    }
  });
}

// Example policy
const EXAMPLE_POLICY = `
name: "Vercel AI Assistant"
description: "AI assistant with controlled access"

allow:
  - "web.search:*"          # Always allow web searches
  - "llm.chat:*"            # Allow LLM interactions

ask:
  - "email.send:*"          # Review emails before sending
  - "code.execute:*"        # Review code execution

block:
  - "fs.delete:*"           # Block file operations
  - "system.shell:*"        # Block shell commands
`;

console.log("📋 Example Policy:");
console.log(EXAMPLE_POLICY);

// Run example
if (process.env.OPENAI_API_KEY) {
  runVercelAIAgent().catch(console.error);
} else {
  console.log("\n⚠️  Set OPENAI_API_KEY to run this example");
  console.log("This example shows how Echos integrates with Vercel AI SDK");
}

