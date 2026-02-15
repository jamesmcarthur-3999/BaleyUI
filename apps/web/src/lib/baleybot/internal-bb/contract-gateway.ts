import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('internal-bb-contract-gateway');

export type FallbackMode = 'throw' | 'value';

interface ContractGatewayBotMetrics {
  runs: number;
  parseFailures: number;
  repairAttempts: number;
  repairSuccesses: number;
  fallbackUsages: number;
  hardFailures: number;
}

const contractGatewayMetrics = new Map<string, ContractGatewayBotMetrics>();

function getBotMetrics(botName: string): ContractGatewayBotMetrics {
  const existing = contractGatewayMetrics.get(botName);
  if (existing) return existing;

  const created: ContractGatewayBotMetrics = {
    runs: 0,
    parseFailures: 0,
    repairAttempts: 0,
    repairSuccesses: 0,
    fallbackUsages: 0,
    hardFailures: 0,
  };
  contractGatewayMetrics.set(botName, created);
  return created;
}

export function getContractGatewayMetrics(): Record<string, ContractGatewayBotMetrics> {
  return Object.fromEntries(
    Array.from(contractGatewayMetrics.entries()).map(([botName, metrics]) => [
      botName,
      { ...metrics },
    ])
  );
}

export function resetContractGatewayMetrics(): void {
  contractGatewayMetrics.clear();
}

export interface ContractGatewayRunOptions<TExecutionOptions, TOutput> {
  botName: string;
  input: string;
  schema: z.ZodType<TOutput>;
  execute: (
    botName: string,
    input: string,
    options?: TExecutionOptions
  ) => Promise<{ output: unknown }>;
  executionOptions?: TExecutionOptions;
  fallbackMode?: FallbackMode;
  fallbackValue?: TOutput;
  repairAttempts?: number;
}

function summarizeOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.slice(0, 500);
  }
  try {
    return JSON.stringify(output).slice(0, 500);
  } catch {
    return String(output).slice(0, 500);
  }
}

function tryParseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function extractJsonCodeFence(raw: string): string | undefined {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const fenced = match?.[1]?.trim();
  return fenced && fenced.length > 0 ? fenced : undefined;
}

function extractBalancedJsonSegment(raw: string): string | undefined {
  const openChars = new Set(['{', '[']);
  const closeFor: Record<string, string> = {
    '{': '}',
    '[': ']',
  };

  let start = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char && openChars.has(char)) {
      start = i;
      break;
    }
  }
  if (start === -1) return undefined;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
    if (!char) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (openChars.has(char)) {
      stack.push(closeFor[char]!);
      continue;
    }

    if (stack.length > 0 && char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return undefined;
}

export function normalizeOutputCandidate(output: unknown): unknown {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }

  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return output;

    const direct = tryParseJson(trimmed);
    if (direct !== undefined) return direct;

    const fenced = extractJsonCodeFence(trimmed);
    if (fenced) {
      const parsedFence = tryParseJson(fenced);
      if (parsedFence !== undefined) return parsedFence;
    }

    const balanced = extractBalancedJsonSegment(trimmed);
    if (balanced) {
      const parsedBalanced = tryParseJson(balanced);
      if (parsedBalanced !== undefined) return parsedBalanced;
    }
  }

  return output;
}

export function parseOutputAgainstSchema<TOutput>(
  schema: z.ZodType<TOutput>,
  output: unknown
): {
  success: true;
  data: TOutput;
  normalizedOutput: unknown;
} | {
  success: false;
  issues: z.ZodIssue[];
  normalizedOutput: unknown;
} {
  const normalized = normalizeOutputCandidate(output);
  const parsed = schema.safeParse(normalized);

  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
      normalizedOutput: normalized,
    };
  }

  return {
    success: false,
    issues: parsed.error.issues,
    normalizedOutput: normalized,
  };
}

export function formatContractRepairPrompt(args: {
  botName: string;
  originalInput: string;
  previousOutput: unknown;
  issues: z.ZodIssue[];
}): string {
  const issueSummary = args.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  return [
    `Repair your previous ${args.botName} output so it matches your output contract exactly.`,
    'Return only one valid JSON object and nothing else.',
    '',
    'Original request:',
    args.originalInput,
    '',
    'Validation issues to fix:',
    issueSummary || '(unknown validation issue)',
    '',
    'Previous output preview:',
    summarizeOutput(args.previousOutput),
  ].join('\n');
}

export async function runWithContractGateway<TOutput, TExecutionOptions>(
  args: ContractGatewayRunOptions<TExecutionOptions, TOutput>
): Promise<TOutput> {
  const {
    botName,
    input,
    schema,
    execute,
    executionOptions,
    fallbackMode = 'throw',
    fallbackValue,
    repairAttempts = 1,
  } = args;
  const metrics = getBotMetrics(botName);
  metrics.runs += 1;

  try {
    let { output } = await execute(botName, input, executionOptions);
    let parsed = parseOutputAgainstSchema(schema, output);

    if (parsed.success) {
      return parsed.data;
    }

    metrics.parseFailures += 1;

    log.warn('Internal BB output parse failed', {
      botName,
      issues: parsed.issues,
      outputType: typeof output,
      outputPreview: summarizeOutput(output),
    });

    const maxRepairAttempts = Math.max(0, repairAttempts);
    for (let attempt = 1; attempt <= maxRepairAttempts; attempt += 1) {
      metrics.repairAttempts += 1;
      const repairPrompt = formatContractRepairPrompt({
        botName,
        originalInput: input,
        previousOutput: parsed.normalizedOutput,
        issues: parsed.issues,
      });

      const repaired = await execute(botName, repairPrompt, executionOptions);
      output = repaired.output;
      parsed = parseOutputAgainstSchema(schema, output);

      if (parsed.success) {
        metrics.repairSuccesses += 1;
        log.info('Internal BB output repaired successfully', {
          botName,
          attempt,
        });
        return parsed.data;
      }

      log.warn('Internal BB output repair attempt failed', {
        botName,
        attempt,
        issues: parsed.issues,
        outputPreview: summarizeOutput(output),
      });
    }

    if (fallbackMode === 'value' && fallbackValue !== undefined) {
      metrics.fallbackUsages += 1;
      return fallbackValue;
    }

    const issueSummary = parsed.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`${botName} returned malformed output: ${issueSummary}`);
  } catch (error) {
    if (fallbackMode === 'value' && fallbackValue !== undefined) {
      metrics.fallbackUsages += 1;
      log.warn('Internal BB execution failed, using fallback value', {
        botName,
        error: error instanceof Error ? error.message : String(error),
      });
      return fallbackValue;
    }

    metrics.hardFailures += 1;
    throw error;
  }
}
