/**
 * Slack Bot Integration Template
 *
 * This template shows how to integrate BaleyUI with a Slack bot
 * using the Bolt framework.
 *
 * Prerequisites:
 * - npm install @slack/bolt @baleyui/sdk
 * - Create a Slack app at https://api.slack.com/apps
 * - Enable Socket Mode and Event Subscriptions
 * - Add bot token scopes: chat:write, app_mentions:read
 */

import { App } from '@slack/bolt';
import { BaleyUI } from '@baleyui/sdk';

// Initialize BaleyUI client
const baleyui = new BaleyUI({
  apiKey: process.env.BALEYUI_API_KEY!,
});

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Flow ID for handling messages
const AI_FLOW_ID = process.env.BALEYUI_FLOW_ID!;

// Handle app mentions
app.event('app_mention', async ({ event, say }) => {
  try {
    // Extract the message text (remove the bot mention)
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    // Show typing indicator
    await say({
      text: 'Thinking...',
      thread_ts: event.ts,
    });

    // Execute the flow
    const execution = await baleyui.flows.execute(AI_FLOW_ID, {
      input: {
        message: text,
        user: event.user,
        channel: event.channel,
      },
    });

    // Wait for completion
    const result = await execution.waitForCompletion();

    if (result.status === 'completed' && result.output) {
      const response = typeof result.output === 'string'
        ? result.output
        : (result.output as { response?: string }).response || JSON.stringify(result.output);

      await say({
        text: response,
        thread_ts: event.ts,
      });
    } else if (result.status === 'failed') {
      await say({
        text: 'Sorry, I encountered an error processing your request.',
        thread_ts: event.ts,
      });
    }
  } catch (error) {
    console.error('Error handling mention:', error);
    await say({
      text: 'Sorry, something went wrong. Please try again.',
      thread_ts: event.ts,
    });
  }
});

// Handle direct messages
app.message(async ({ message, say }) => {
  // Type guard for message with text
  if (!('text' in message) || !message.text) return;

  try {
    const execution = await baleyui.flows.execute(AI_FLOW_ID, {
      input: {
        message: message.text,
        user: message.user,
        channel: message.channel,
      },
    });

    const result = await execution.waitForCompletion();

    if (result.status === 'completed' && result.output) {
      const response = typeof result.output === 'string'
        ? result.output
        : (result.output as { response?: string }).response || JSON.stringify(result.output);

      await say(response);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await say('Sorry, something went wrong. Please try again.');
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack bot is running!');
})();

/**
 * Example Flow Configuration:
 *
 * Your BaleyUI flow should:
 * 1. Accept input: { message: string, user: string, channel: string }
 * 2. Process with an AI block (Claude, GPT, etc.)
 * 3. Return output: { response: string }
 *
 * Environment Variables:
 * - BALEYUI_API_KEY: Your BaleyUI API key
 * - BALEYUI_FLOW_ID: The flow ID to execute
 * - SLACK_BOT_TOKEN: Slack bot OAuth token (xoxb-...)
 * - SLACK_SIGNING_SECRET: Slack app signing secret
 * - SLACK_APP_TOKEN: Slack app-level token for Socket Mode (xapp-...)
 */
