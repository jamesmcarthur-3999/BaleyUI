#!/usr/bin/env npx tsx
/**
 * BaleyBot CLI - Execute BaleyBots from the command line
 *
 * This script allows Claude Code to interact with BaleyBots directly,
 * proving the integration between the BaleyUI platform and external AI systems.
 *
 * Usage:
 *   npx tsx scripts/baleybot-cli.ts execute --code "..." --input "..."
 *   npx tsx scripts/baleybot-cli.ts execute --file ./bot.bal --input "..."
 *   npx tsx scripts/baleybot-cli.ts analyze --input "code to analyze"
 */

// Use relative import to the local baleybots package
import { Pipeline } from '../packages/baleybots/typescript/packages/tools/src/index.js';
import { readFileSync } from 'fs';

// Default BaleyBots for quick access
const BUILTIN_BOTS = {
  // Code analyzer - helps with code review
  'code-analyzer': `
code_analyzer {
  "goal": "Analyze the provided code and identify potential bugs, security issues, code smells, and suggest improvements. Be concise but thorough.",
  "model": "openai:gpt-4o"
}
`,
  // Sentiment analyzer
  'sentiment': `
sentiment_analyzer {
  "goal": "Analyze the sentiment of the input text. Return: sentiment (positive/negative/neutral), confidence (0-1), and key emotional words.",
  "model": "openai:gpt-4o"
}
`,
  // Summarizer
  'summarize': `
summarizer {
  "goal": "Create a concise summary of the input text, highlighting key points and main ideas.",
  "model": "openai:gpt-4o"
}
`,
  // Test generator
  'test-gen': `
test_generator {
  "goal": "Generate unit tests for the provided code. Use appropriate testing patterns and cover edge cases.",
  "model": "openai:gpt-4o"
}
`,
  // Documentation writer
  'doc-writer': `
doc_writer {
  "goal": "Generate clear documentation for the provided code including function descriptions, parameters, return values, and usage examples.",
  "model": "openai:gpt-4o"
}
`,
};

type BuiltinBotName = keyof typeof BUILTIN_BOTS;

async function executeBaleyBot(balCode: string, input: string): Promise<void> {
  console.log('🤖 Executing BaleyBot...\n');

  try {
    const pipeline = Pipeline.from(balCode, {
      providerConfig: {
        apiKey: process.env.OPENAI_API_KEY,
      },
    });

    const result = await pipeline.process(input, {
      onToken: (botName, event) => {
        if (event.type === 'text_delta' && 'content' in event) {
          process.stdout.write(event.content);
        }
      },
    });

    console.log('\n\n✅ Execution complete');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Execution failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
BaleyBot CLI - Execute BaleyBots from the command line

Usage:
  npx tsx scripts/baleybot-cli.ts <command> [options]

Commands:
  execute    Execute a BaleyBot with input
  list       List built-in BaleyBots

Execute Options:
  --code <bal>     BAL code to execute
  --file <path>    Path to .bal file
  --bot <name>     Use built-in bot: ${Object.keys(BUILTIN_BOTS).join(', ')}
  --input <text>   Input to process (or read from stdin)

Examples:
  # Use built-in code analyzer
  npx tsx scripts/baleybot-cli.ts execute --bot code-analyzer --input "function add(a,b){return a+b}"

  # Use custom BAL code
  npx tsx scripts/baleybot-cli.ts execute --code 'helper {"goal":"Help user","model":"openai:gpt-4o"}' --input "Hello"

  # Analyze sentiment
  npx tsx scripts/baleybot-cli.ts execute --bot sentiment --input "I love this product!"

Environment:
  OPENAI_API_KEY     Required for execution
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'list') {
    console.log('Built-in BaleyBots:\n');
    for (const [name, code] of Object.entries(BUILTIN_BOTS)) {
      console.log(`  ${name}`);
      console.log(`    ${code.trim().split('\n')[0]}...\n`);
    }
    process.exit(0);
  }

  if (command === 'execute') {
    let balCode: string | undefined;
    let input: string | undefined;

    // Parse arguments
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      const next = args[i + 1];

      switch (arg) {
        case '--code':
          balCode = next;
          i++;
          break;
        case '--file':
          balCode = readFileSync(next, 'utf-8');
          i++;
          break;
        case '--bot':
          if (next in BUILTIN_BOTS) {
            balCode = BUILTIN_BOTS[next as BuiltinBotName];
          } else {
            console.error(`Unknown bot: ${next}`);
            console.error(`Available: ${Object.keys(BUILTIN_BOTS).join(', ')}`);
            process.exit(1);
          }
          i++;
          break;
        case '--input':
          input = next;
          i++;
          break;
      }
    }

    if (!balCode) {
      console.error('Error: Must provide --code, --file, or --bot');
      process.exit(1);
    }

    if (!input) {
      console.error('Error: Must provide --input');
      process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Error: OPENAI_API_KEY environment variable required');
      process.exit(1);
    }

    await executeBaleyBot(balCode, input);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

main().catch(console.error);
