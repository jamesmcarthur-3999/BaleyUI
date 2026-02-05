#!/usr/bin/env npx tsx
/**
 * Quick BaleyBot execution script for Claude Code integration
 */

import { executeBALCode } from '../packages/sdk/src/bal-executor.js';

const balCode = `
claude_code_analyzer {
  "goal": "You are a code analysis assistant. When given code, explain what it does step by step, identify the algorithm or pattern being used, and suggest any improvements or potential issues.",
  "model": "anthropic:claude-sonnet-4-20250514"
}
`;

const input = process.argv[2] || 'function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }';

async function main() {
  console.log('🤖 Executing BaleyBot...\n');
  console.log('Input:', input, '\n');
  console.log('---\n');

  try {
    const result = await executeBALCode(balCode, {
      input,
      apiKey: process.env.ANTHROPIC_API_KEY,
      onEvent: (event) => {
        if (event.type === 'token' && 'event' in event) {
          const e = event.event;
          if (e.type === 'text_delta' && 'content' in e) {
            process.stdout.write(e.content);
          }
        }
      },
    });

    console.log('\n\n---');
    console.log('✅ Status:', result.status);
    if (result.result) {
      console.log('\n📊 Result:');
      console.log(typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2));
    }
    if (result.error) {
      console.log('❌ Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

main();
