#!/usr/bin/env node

/**
 * @baleyui/runtime CLI — one command to run a BaleyBot.
 *
 * Usage:
 *   npx @baleyui/runtime run ./my-bot.baleybot.json "Hello, help me with X"
 *   npx @baleyui/runtime run ./my-bot.baleybot.json "Hello" --stream
 *   npx @baleyui/runtime info ./my-bot.baleybot.json
 */

import { BaleybotRuntime } from './index';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'run':
      await runCommand(args.slice(1));
      break;
    case 'info':
      await infoCommand(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

async function runCommand(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: baleyui-runtime run <bundle.baleybot.json> <input> [--stream]');
    process.exit(1);
  }

  const bundlePath = args[0];
  const input = args[1];
  const shouldStream = args.includes('--stream');

  const runtime = new BaleybotRuntime();

  try {
    await runtime.load(bundlePath);
    const info = runtime.getBundleInfo();
    console.log(`${info?.icon || '🤖'} Running: ${info?.name || 'unknown'}`);
    console.log('');

    if (shouldStream) {
      for await (const event of runtime.stream(input)) {
        if (event.type === 'text_delta' && typeof event.content === 'string') {
          process.stdout.write(event.content);
        }
      }
      console.log('');
    } else {
      const result = await runtime.execute(input);

      if (result.status === 'completed') {
        console.log(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2));
      } else {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      console.log(`\n--- Completed in ${result.duration}ms ---`);
    }

    await runtime.shutdown();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function infoCommand(args: string[]) {
  if (args.length < 1) {
    console.error('Usage: baleyui-runtime info <bundle.baleybot.json>');
    process.exit(1);
  }

  const runtime = new BaleybotRuntime();
  await runtime.load(args[0]);
  const bundle = runtime.getBundleInfo();

  if (!bundle) {
    console.error('Failed to load bundle');
    process.exit(1);
  }

  console.log(`${bundle.icon} ${bundle.name}`);
  console.log(`  ${bundle.description}`);
  console.log('');
  console.log(`  Entities: ${bundle.entityNames.join(', ') || 'none'}`);
  console.log(`  Required Tools: ${bundle.requiredTools.join(', ') || 'none'}`);
  console.log(`  Required Providers: ${bundle.requiredProviders.join(', ') || 'none'}`);

  if (bundle.testCases && bundle.testCases.length > 0) {
    console.log(`  Test Cases: ${bundle.testCases.length}`);
  }
}

function printUsage() {
  console.log(`
@baleyui/runtime — Run BaleyBots anywhere

Usage:
  baleyui-runtime run <bundle.baleybot.json> <input> [--stream]
  baleyui-runtime info <bundle.baleybot.json>

Commands:
  run     Execute a BaleyBot with the given input
  info    Show bundle information

Options:
  --stream    Stream output in real-time (with 'run' command)
  --help      Show this help message

Environment Variables:
  ANTHROPIC_API_KEY    Anthropic API key
  OPENAI_API_KEY       OpenAI API key
  BALEYUI_API_KEY      BaleyUI cloud API key (for usage reporting)
  RUNTIME_DB_URL       Storage URL (libsql:// or postgres://)

Examples:
  baleyui-runtime run ./my-bot.baleybot.json "Help me with X"
  baleyui-runtime run ./my-bot.baleybot.json "Analyze this" --stream
  baleyui-runtime info ./my-bot.baleybot.json
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
