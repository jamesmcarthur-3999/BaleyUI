#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());

const TARGETS = [
  'apps/web/src/components/baleybot',
  'apps/web/src/lib/baleybot',
  'apps/web/src/lib/execution',
  'packages/sdk',
  'docs/reference',
  '.claude/plugins/baleyui-dev',
  'CLAUDE.md',
];

const EXCLUDED_PATH_PARTS = [
  '/docs/archive/',
  '/docs/plans/',
  '/packages/baleybots/',
  '/node_modules/',
  '/.next/',
  '/dist/',
  '/coverage/',
  '/__tests__/',
];

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md']);

const GENERAL_PATTERNS = [
  {
    id: 'legacy-route',
    description: 'BAL v1 route() composition',
    regex: /\broute\s*\(/g,
  },
  {
    id: 'legacy-gate',
    description: 'BAL v1 gate() composition',
    regex: /\bgate\s*\(/g,
  },
  {
    id: 'legacy-processor',
    description: 'BAL v1 processor() composition',
    regex: /\bprocessor\s*\(/g,
  },
  {
    id: 'legacy-filter',
    description: 'BAL v1 filter() composition',
    regex: /\bfilter\s*\(\s*["']/g,
  },
  {
    id: 'legacy-when',
    description: 'BAL v1 when {...} branching',
    regex: /\bwhen\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\{/g,
  },
  {
    id: 'legacy-entity-directive',
    description: 'BAL v1 @entity directive',
    regex: /@entity\b/g,
  },
  {
    id: 'legacy-run-directive',
    description: 'BAL v1 @run directive',
    regex: /@run\b/g,
  },
  {
    id: 'legacy-tools-array',
    description: 'Legacy tools array syntax "tools": [...]',
    regex: /"tools"\s*:\s*\[/g,
    appliesTo: (relative) => !relative.endsWith('.json'),
  },
];

const BAL_DOC_TRY_PATTERN = {
  id: 'legacy-try-catch',
  description: 'BAL v1 try/catch composition',
  regex: /\btry\s*(?:\([^)]*\))?\s*\{[\s\S]{0,400}?\}\s*catch\s*\{/g,
};

const LEGACY_FLOW_IMPORT_PATTERN = {
  id: 'legacy-flow-stack-import',
  description: 'Import from retired apps/web/src/lib/baleybots stack',
  regex: /from\s+["']@\/lib\/baleybots\//g,
};

const RULE_FILE_EXEMPTIONS = {
  'legacy-route': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-gate': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-filter': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-processor': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-when': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-entity-directive': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-run-directive': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
  'legacy-tools-array': [/^apps\/web\/src\/lib\/baleybot\/bal-parser-pure\.ts$/],
};

function isExcluded(absolutePath) {
  const normalized = absolutePath.split(path.sep).join('/');
  return EXCLUDED_PATH_PARTS.some((part) => normalized.includes(part));
}

function collectFiles(entryPath, files) {
  const absolute = path.resolve(repoRoot, entryPath);
  if (!fs.existsSync(absolute)) return;

  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (ALLOWED_EXTENSIONS.has(path.extname(absolute))) {
      files.push(absolute);
    }
    return;
  }

  const stack = [absolute];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (isExcluded(current)) continue;

    const currentStat = fs.statSync(current);
    if (currentStat.isDirectory()) {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(child);
        } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(child))) {
          files.push(child);
        }
      }
    }
  }
}

function lineOf(content, offset) {
  const upto = content.slice(0, offset);
  return upto.split('\n').length;
}

function isRuleExempt(ruleId, relativePath) {
  const patterns = RULE_FILE_EXEMPTIONS[ruleId] ?? [];
  return patterns.some((pattern) => pattern.test(relativePath));
}

const allFiles = [];
for (const target of TARGETS) {
  collectFiles(target, allFiles);
}

const uniqueFiles = Array.from(new Set(allFiles)).filter((file) => !isExcluded(file));
const findings = [];

for (const file of uniqueFiles) {
  const relative = path.relative(repoRoot, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');

  for (const pattern of GENERAL_PATTERNS) {
    if (typeof pattern.appliesTo === 'function' && !pattern.appliesTo(relative)) {
      continue;
    }
    if (isRuleExempt(pattern.id, relative)) {
      continue;
    }
    for (const match of text.matchAll(pattern.regex)) {
      findings.push({
        file: relative,
        line: lineOf(text, match.index ?? 0),
        rule: pattern.id,
        description: pattern.description,
        snippet: match[0],
      });
    }
  }

  if (relative.endsWith('.md') || relative.endsWith('.json') || relative.endsWith('bal-language.ts')) {
    for (const match of text.matchAll(BAL_DOC_TRY_PATTERN.regex)) {
      findings.push({
        file: relative,
        line: lineOf(text, match.index ?? 0),
        rule: BAL_DOC_TRY_PATTERN.id,
        description: BAL_DOC_TRY_PATTERN.description,
        snippet: 'try ... catch',
      });
    }
  }

  for (const match of text.matchAll(LEGACY_FLOW_IMPORT_PATTERN.regex)) {
    findings.push({
      file: relative,
      line: lineOf(text, match.index ?? 0),
      rule: LEGACY_FLOW_IMPORT_PATTERN.id,
      description: LEGACY_FLOW_IMPORT_PATTERN.description,
      snippet: match[0],
    });
  }
}

if (findings.length > 0) {
  console.error('BAL v2 compliance check failed. Legacy patterns found:\n');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.description}`);
  }
  process.exit(1);
}

console.log(`BAL v2 compliance check passed (${uniqueFiles.length} files scanned).`);
