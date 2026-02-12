#!/usr/bin/env node

import { readFileSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromPDF } from './lib/pdf-reader.mjs';
import { executeBaleyBot } from './lib/sse-client.mjs';
import { storeAnalysis } from './lib/db.mjs';
import { displayResult, progress, success, error } from './lib/display.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BALEYBOT_ID = process.env.BALEYBOT_ID;
const BALEYBOT_API_KEY = process.env.BALEYBOT_API_KEY;
const BALEYBOT_BASE_URL = process.env.BALEYBOT_BASE_URL || 'http://localhost:3000';

function printUsage() {
  console.log(`
  Usage:
    node analyze.mjs <path-to-pdf>     Analyze a PDF contract
    node analyze.mjs --sample           Analyze the sample contract text
    node analyze.mjs --history          Show past analyses

  Environment variables:
    BALEYBOT_ID        BaleyBot ID (from Integrate tab)
    BALEYBOT_API_KEY   API key (from Integrate tab)
    BALEYBOT_BASE_URL  Base URL (default: http://localhost:3000)
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // History mode
  if (args.includes('--history')) {
    const { listAnalyses } = await import('./lib/db.mjs');
    const analyses = listAnalyses(20);
    if (analyses.length === 0) {
      console.log('\n  No analyses found. Run an analysis first.\n');
    } else {
      console.log('\n  Past Analyses:');
      console.log('  ' + '─'.repeat(58));
      for (const a of analyses) {
        const risk = a.overall_risk_score != null ? `${a.overall_risk_score.toFixed(1)}/10` : 'N/A';
        console.log(`  #${a.id}  ${a.filename.padEnd(30)}  Risk: ${risk}  Flags: ${a.red_flag_count}  ${a.analyzed_at}`);
      }
      console.log('');
    }
    process.exit(0);
  }

  // Validate config
  if (!BALEYBOT_ID || !BALEYBOT_API_KEY) {
    error('Missing BALEYBOT_ID or BALEYBOT_API_KEY environment variables.');
    printUsage();
    process.exit(1);
  }

  // Get contract text
  let contractText;
  let filename;

  if (args.includes('--sample')) {
    const samplePath = resolve(__dirname, 'sample-contract.txt');
    contractText = readFileSync(samplePath, 'utf-8');
    filename = 'sample-contract.txt';
    progress('Using sample contract text');
  } else {
    const filePath = resolve(args[0]);
    filename = basename(filePath);

    if (filePath.endsWith('.pdf')) {
      progress(`Reading PDF: ${filename}`);
      contractText = await extractTextFromPDF(filePath);
    } else {
      progress(`Reading text file: ${filename}`);
      contractText = readFileSync(filePath, 'utf-8');
    }
  }

  success(`Loaded ${contractText.length.toLocaleString()} characters from ${filename}`);
  progress(`Sending to BaleyBot pipeline at ${BALEYBOT_BASE_URL}...`);

  // Track events for progress
  let lastBotName = '';
  const onEvent = (event) => {
    if (event.type === 'execution_started') {
      success(`Execution started: ${event.executionId}`);
    } else if (event.type === 'graph_event') {
      const ge = event.graphEvent ?? event;
      if (ge.type === 'node_started' && ge.entityName) {
        progress(`Running: ${ge.entityName}`);
      } else if (ge.type === 'node_succeeded' && ge.entityName) {
        success(`Completed: ${ge.entityName}`);
      }
    } else if (event.type === 'text_delta' && event.botName && event.botName !== lastBotName) {
      lastBotName = event.botName;
      progress(`${event.botName} is generating...`);
    }
  };

  try {
    const result = await executeBaleyBot({
      baseUrl: BALEYBOT_BASE_URL,
      botId: BALEYBOT_ID,
      apiKey: BALEYBOT_API_KEY,
      input: contractText,
      onEvent,
    });

    if (result.status === 'failed') {
      error(`Execution failed: ${result.error ?? 'Unknown error'}`);
      process.exit(1);
    }

    // Parse output — may be string (JSON) or object
    let output = result.output;
    if (typeof output === 'string') {
      try {
        output = JSON.parse(output);
      } catch {
        // Try extracting JSON from markdown fence
        const match = output.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          output = JSON.parse(match[1]);
        } else {
          error('Could not parse output as JSON');
          console.log('\nRaw output:\n', output);
          process.exit(1);
        }
      }
    }

    // Store in SQLite
    const contractId = storeAnalysis({ filename, result: output });
    success(`Stored as contract #${contractId} in contracts.db`);

    // Display
    displayResult(output, filename);

    console.log(`  ${'\x1b[2m'}Duration: ${(result.durationMs / 1000).toFixed(1)}s | Execution: ${result.executionId}${'\x1b[0m'}\n`);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
