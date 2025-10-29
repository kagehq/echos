/**
 * Custom Agent Framework Integration
 * 
 * Shows how to wrap ANY agent framework or custom tool with Echos governance.
 * This pattern works with any agent system in any language.
 */

import { echos } from '@echoshq/sdk';

// Create Echos client
const agent = echos('custom-agent');

/**
 * Pattern 1: Wrap Individual Tool Functions
 */
class GovernedTools {
  private agent = echos('tool-agent');

  async sendEmail(to: string, subject: string, body: string) {
    // Governance check BEFORE execution
    await this.agent.emit('email.send', to, { subject }, { body });
    
    // Only reaches here if allowed by policy
    return this.actualSendEmail(to, subject, body);
  }

  async postToSlack(channel: string, message: string) {
    await this.agent.emit('slack.post', channel, { message });
    return this.actualPostToSlack(channel, message);
  }

  async queryDatabase(query: string) {
    await this.agent.emit('db.query', query);
    return this.actualQueryDatabase(query);
  }

  // Actual implementations (replace with your real tools)
  private async actualSendEmail(to: string, subject: string, body: string) {
    console.log(`📧 Sending email to ${to}: ${subject}`);
    return { success: true };
  }

  private async actualPostToSlack(channel: string, message: string) {
    console.log(`💬 Posting to ${channel}: ${message}`);
    return { success: true };
  }

  private async actualQueryDatabase(query: string) {
    console.log(`🗄️  Executing query: ${query}`);
    return { rows: [] };
  }
}

/**
 * Pattern 2: Decorator Pattern for Tool Wrapping
 */
function withGovernance(intent: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const agent = echos('decorated-agent');
      
      // Extract target from first argument (customize as needed)
      const target_value = args[0];
      
      try {
        // Policy check
        await agent.emit(intent, String(target_value), {
          method: propertyKey,
          args: args.slice(1),
        });
        
        // Execute original method
        return await originalMethod.apply(this, args);
      } catch (error: any) {
        throw new Error(`Action blocked by policy: ${error.message}`);
      }
    };

    return descriptor;
  };
}

// Note: Decorator pattern requires experimentalDecorators in tsconfig.json
// Uncomment and configure tsconfig to use this pattern
/*
class DecoratedAgent {
  @withGovernance('email.send')
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`📧 Email sent to ${to}`);
    return { success: true };
  }

  @withGovernance('slack.post')
  async postToSlack(channel: string, message: string) {
    console.log(`💬 Posted to ${channel}`);
    return { success: true };
  }
}
*/

/**
 * Pattern 3: Middleware Pattern for Agent Actions
 */
interface Action {
  type: string;
  target: string;
  params?: any;
}

class AgentWithMiddleware {
  private agent = echos('middleware-agent');

  async execute(action: Action) {
    // Governance middleware
    await this.checkPolicy(action);
    
    // Execute action
    return this.performAction(action);
  }

  private async checkPolicy(action: Action) {
    await this.agent.emit(
      action.type,
      action.target,
      action.params
    );
  }

  private async performAction(action: Action) {
    console.log(`⚙️  Executing: ${action.type} → ${action.target}`);
    
    switch (action.type) {
      case 'email.send':
        return { success: true, message: 'Email sent' };
      case 'slack.post':
        return { success: true, message: 'Posted to Slack' };
      case 'db.query':
        return { success: true, rows: [] };
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
}

/**
 * Pattern 4: Proxy Pattern for Auto-Governance
 */
function createGovernedProxy<T extends object>(
  target: T,
  agentName: string
): T {
  const agent = echos(agentName);

  return new Proxy(target, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (typeof original === 'function') {
        return async function (...args: any[]) {
          const intent = `${String(prop)}`;
          const targetValue = args[0] || '';

          // Auto-governance check
          await agent.emit(intent, String(targetValue), { args });

          // Call original method
          return original.apply(target, args);
        };
      }

      return original;
    },
  });
}

// Example tool implementation
class EmailService {
  async send(to: string, subject: string, body: string) {
    console.log(`📧 Sending email to ${to}`);
    return { success: true };
  }
}

// Create governed version with zero code changes
const governedEmailService = createGovernedProxy(
  new EmailService(),
  'email-service'
);

/**
 * Examples in Action
 */
async function runExamples() {
  console.log('=== Pattern 1: Governed Tools ===');
  const tools = new GovernedTools();
  try {
    await tools.sendEmail('user@example.com', 'Test', 'Hello!');
  } catch (e: any) {
    console.log('Blocked:', e.message);
  }

  console.log('\n=== Pattern 2: Decorator Pattern ===');
  console.log('(Skipping - requires experimentalDecorators in tsconfig)');
  // const decorated = new DecoratedAgent();
  // try {
  //   await decorated.sendEmail('user@example.com', 'Test', 'Hello!');
  // } catch (e: any) {
  //   console.log('Blocked:', e.message);
  // }

  console.log('\n=== Pattern 3: Middleware Pattern ===');
  const middleware = new AgentWithMiddleware();
  try {
    await middleware.execute({
      type: 'email.send',
      target: 'user@example.com',
      params: { subject: 'Test', body: 'Hello!' },
    });
  } catch (e: any) {
    console.log('Blocked:', e.message);
  }

  console.log('\n=== Pattern 4: Proxy Pattern ===');
  try {
    await governedEmailService.send('user@example.com', 'Test', 'Hello!');
  } catch (e: any) {
    console.log('Blocked:', e.message);
  }
}

// Run examples
runExamples().catch(console.error);

// Export patterns for reuse
export { GovernedTools, withGovernance, AgentWithMiddleware, createGovernedProxy };

