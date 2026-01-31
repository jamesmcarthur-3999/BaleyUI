/**
 * Discord Bot Integration Template
 *
 * This template shows how to integrate BaleyUI with a Discord bot
 * using discord.js.
 *
 * Prerequisites:
 * - npm install discord.js @baleyui/sdk
 * - Create a Discord app at https://discord.com/developers/applications
 * - Enable MESSAGE CONTENT INTENT in Bot settings
 * - Add bot to server with Send Messages permission
 */

import { Client, GatewayIntentBits, Events, Message } from 'discord.js';
import { BaleyUI } from '@baleyui/sdk';

// Initialize BaleyUI client
const baleyui = new BaleyUI({
  apiKey: process.env.BALEYUI_API_KEY!,
});

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Flow ID for handling messages
const AI_FLOW_ID = process.env.BALEYUI_FLOW_ID!;

// Bot prefix for commands
const PREFIX = '!ai';

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Discord bot ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for prefix or direct mention
  const isMentioned = message.mentions.has(client.user!);
  const hasPrefix = message.content.startsWith(PREFIX);

  if (!isMentioned && !hasPrefix) return;

  try {
    // Extract the actual message
    let userMessage = message.content;
    if (hasPrefix) {
      userMessage = message.content.slice(PREFIX.length).trim();
    } else if (isMentioned) {
      userMessage = message.content.replace(/<@!?\d+>/g, '').trim();
    }

    if (!userMessage) {
      await message.reply('Please provide a message!');
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Execute the flow
    const execution = await baleyui.flows.execute(AI_FLOW_ID, {
      input: {
        message: userMessage,
        user: message.author.username,
        userId: message.author.id,
        channel: message.channel.id,
        guild: message.guild?.name || 'DM',
      },
    });

    // Stream events and show progress
    let response = '';
    for await (const event of execution.stream()) {
      if (event.type === 'block_output' && event.data?.output) {
        const output = event.data.output;
        response = typeof output === 'string'
          ? output
          : (output as { response?: string }).response || JSON.stringify(output);
      }
    }

    // Get final result
    const result = await execution.getStatus();

    if (result.status === 'completed' && response) {
      // Discord has a 2000 character limit
      if (response.length > 2000) {
        // Split into multiple messages
        const chunks = response.match(/[\s\S]{1,1990}/g) || [];
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } else if (result.status === 'failed') {
      await message.reply('Sorry, I encountered an error processing your request.');
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await message.reply('Sorry, something went wrong. Please try again.');
  }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

/**
 * Example Flow Configuration:
 *
 * Your BaleyUI flow should:
 * 1. Accept input: { message: string, user: string, userId: string, channel: string, guild: string }
 * 2. Process with an AI block (Claude, GPT, etc.)
 * 3. Return output: { response: string }
 *
 * Environment Variables:
 * - BALEYUI_API_KEY: Your BaleyUI API key
 * - BALEYUI_FLOW_ID: The flow ID to execute
 * - DISCORD_TOKEN: Your Discord bot token
 *
 * Usage:
 * - @BotName what is the weather?
 * - !ai tell me a joke
 */
