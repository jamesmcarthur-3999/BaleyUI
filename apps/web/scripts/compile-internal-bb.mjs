#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTION_ORDER = ['reasoning', 'tool_selection', 'user_communication', 'safety', 'output_rules'];
const VALID_TIERS = new Set(['fast', 'balanced', 'powerful']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveModelRef(modelRef, modelPolicy) {
  if (typeof modelRef !== 'string' || modelRef.trim().length === 0) {
    throw new Error(`Invalid model reference: ${String(modelRef)}`);
  }

  const trimmed = modelRef.trim();
  const parts = trimmed.split(':');
  if (parts.length !== 2) {
    // Already a plain model id without provider prefix. Let baleybots detect provider.
    return trimmed;
  }

  const [provider, right] = parts;
  if (!provider || !right) {
    throw new Error(`Invalid model reference '${trimmed}'`);
  }

  if (VALID_TIERS.has(right)) {
    const tierMapping = modelPolicy?.tiers?.[right];
    if (!tierMapping) {
      throw new Error(`No model policy tier mapping found for '${right}'`);
    }
    const resolved = tierMapping[provider];
    if (!resolved) {
      throw new Error(`No model policy mapping for provider '${provider}' in tier '${right}'`);
    }
    return resolved;
  }

  // Standard provider:model format with explicit model id.
  return trimmed;
}

function parseFrontmatter(markdown, filePath) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing frontmatter in skill file: ${filePath}`);
  }

  const [, rawFrontmatter, body] = match;
  if (!rawFrontmatter) {
    throw new Error(`Empty frontmatter in skill file: ${filePath}`);
  }

  const frontmatter = {};
  for (const line of rawFrontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line in ${filePath}: ${line}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: body.trim(),
  };
}

function listMarkdownFiles(rootDir) {
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(absolute);
      }
    }
  }

  walk(rootDir);
  return files.sort();
}

function normalizeAppliesTo(value) {
  if (!value || value === '*') {
    return ['*'];
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function loadSkills(skillsDir) {
  const files = listMarkdownFiles(skillsDir);
  const skills = new Map();

  for (const filePath of files) {
    const markdown = fs.readFileSync(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(markdown, filePath);

    const id = frontmatter.id;
    const versionRaw = frontmatter.version;
    const section = frontmatter.section;
    const appliesToRaw = frontmatter.appliesTo;

    if (!id || !versionRaw || !section || !appliesToRaw) {
      throw new Error(`Skill ${filePath} is missing required frontmatter fields (id, version, appliesTo, section)`);
    }

    if (!SECTION_ORDER.includes(section)) {
      throw new Error(`Skill ${id} has invalid section '${section}'`);
    }

    const version = Number(versionRaw);
    if (!Number.isFinite(version) || version <= 0) {
      throw new Error(`Skill ${id} has invalid version '${versionRaw}'`);
    }

    if (!body) {
      throw new Error(`Skill ${id} has empty body`);
    }

    if (skills.has(id)) {
      throw new Error(`Duplicate skill id '${id}'`);
    }

    skills.set(id, {
      id,
      version,
      section,
      appliesTo: normalizeAppliesTo(appliesToRaw),
      body,
      filePath,
    });
  }

  return skills;
}

function ensureSkillAppliesToBot(skill, botId) {
  return skill.appliesTo.includes('*') || skill.appliesTo.includes(botId);
}

function titleFromSection(section) {
  switch (section) {
    case 'reasoning':
      return 'Reasoning Guidance';
    case 'tool_selection':
      return 'Tool Selection Guidance';
    case 'user_communication':
      return 'User Communication Guidance';
    case 'safety':
      return 'Safety Guidance';
    case 'output_rules':
      return 'Output Rules';
    default:
      return 'Guidance';
  }
}

function formatBody(body) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildGoal(spec, contract, resolvedSkills) {
  const lines = [];

  lines.push(`Role: ${spec.role}`);
  lines.push(`Outcome: ${spec.description}`);
  lines.push('');

  lines.push('Decision Policy:');
  for (const policyLine of spec.decisionPolicy) {
    lines.push(`- ${policyLine}`);
  }
  lines.push(`- ${spec.uncertaintyPolicy}`);
  lines.push('');

  const hasOutput = contract.output && Object.keys(contract.output).length > 0;
  if (hasOutput) {
    lines.push('Output:');
    lines.push('- Return exactly one JSON object matching this key/type map:');
    for (const [key, value] of Object.entries(contract.output)) {
      lines.push(`  - ${key}: ${value}`);
    }
    lines.push('- Contract rules:');
    for (const rule of contract.rules) {
      lines.push(`  - ${rule}`);
    }
  } else {
    lines.push('Rules:');
    for (const rule of contract.rules) {
      lines.push(`- ${rule}`);
    }
  }
  lines.push('');

  const bySection = new Map();
  for (const section of SECTION_ORDER) {
    bySection.set(section, []);
  }

  for (const skill of resolvedSkills) {
    const target = bySection.get(skill.section);
    if (target) {
      target.push(skill);
    }
  }

  for (const section of SECTION_ORDER) {
    const sectionSkills = bySection.get(section) ?? [];
    if (sectionSkills.length === 0) continue;

    lines.push(`${titleFromSection(section)}:`);
    for (const skill of sectionSkills) {
      lines.push(...formatBody(skill.body));
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

function buildBalCode(spec, goal, contract, modelPolicy) {
  const resolvedModel = resolveModelRef(spec.model, modelPolicy);

  // Build optional tools block (BAL brace syntax)
  let toolsBlock = '';
  if (spec.tools && spec.tools.length > 0) {
    const toolsList = spec.tools.map(t => JSON.stringify(t)).join(', ');
    toolsBlock = `,\n  "tools": { ${toolsList} }`;
  }

  // Build optional maxTokens block
  let maxTokensBlock = '';
  if (spec.maxTokens) {
    maxTokensBlock = `,\n  "maxTokens": ${spec.maxTokens}`;
  }

  const hasOutput = contract.output && Object.keys(contract.output).length > 0;
  if (hasOutput) {
    const outputEntries = Object.entries(contract.output)
      .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(',\n');
    return `${spec.id} {\n  \"goal\": ${JSON.stringify(goal)},\n  \"model\": ${JSON.stringify(resolvedModel)}${toolsBlock}${maxTokensBlock},\n  \"output\": {\n${outputEntries}\n  }\n}\n`;
  }

  // No output block → free-form text mode
  return `${spec.id} {\n  \"goal\": ${JSON.stringify(goal)},\n  \"model\": ${JSON.stringify(resolvedModel)}${toolsBlock}${maxTokensBlock}\n}\n`;
}

function generateDefinitions(specs, contracts, skills, modelPolicy) {
  const definitions = {};

  for (const spec of [...specs].sort((a, b) => a.id.localeCompare(b.id))) {
    const contract = contracts[spec.contractId];
    if (!contract) {
      throw new Error(`Bot '${spec.id}' references unknown contract '${spec.contractId}'`);
    }

    const resolvedSkills = spec.skills.map((skillId) => {
      const skill = skills.get(skillId);
      if (!skill) {
        throw new Error(`Bot '${spec.id}' references unknown skill '${skillId}'`);
      }
      if (!ensureSkillAppliesToBot(skill, spec.id)) {
        throw new Error(`Skill '${skill.id}' does not apply to bot '${spec.id}'`);
      }
      return skill;
    });

    const goal = buildGoal(spec, contract, resolvedSkills);
    const balCode = buildBalCode(spec, goal, contract, modelPolicy);

    definitions[spec.id] = {
      name: spec.id,
      description: spec.description,
      icon: spec.icon,
      balCode,
    };
  }

  return definitions;
}

function generateFileContent(definitions) {
  const serialized = JSON.stringify(definitions, null, 2);

  return `/**\n * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.\n *\n * Generated by: apps/web/scripts/compile-internal-bb.mjs\n * Source: apps/web/src/lib/baleybot/internal-bb/source/*.json + apps/web/src/lib/baleybot/internal-bb/skills/*.md\n */\n\nexport interface GeneratedInternalBaleybotDef {\n  name: string;\n  description: string;\n  icon: string;\n  balCode: string;\n}\n\nexport const GENERATED_INTERNAL_BALEYBOTS = ${serialized} as const satisfies Record<string, GeneratedInternalBaleybotDef>;\n`;
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(scriptDir, '..');
  const internalRoot = path.join(appRoot, 'src', 'lib', 'baleybot', 'internal-bb');

  const contractsPath = path.join(internalRoot, 'source', 'contracts.json');
  const specsPath = path.join(internalRoot, 'source', 'specs.json');
  const modelPolicyPath = path.join(internalRoot, 'source', 'model-policy.json');
  const skillsDir = path.join(internalRoot, 'skills');
  const outputPath = path.join(internalRoot, 'generated-definitions.ts');

  const contracts = readJson(contractsPath);
  const specs = readJson(specsPath);
  const modelPolicy = readJson(modelPolicyPath);
  const skills = loadSkills(skillsDir);

  const definitions = generateDefinitions(specs, contracts, skills, modelPolicy);
  const output = generateFileContent(definitions);

  fs.writeFileSync(outputPath, output, 'utf8');
  process.stdout.write(`Generated ${Object.keys(definitions).length} internal BB definitions to ${outputPath}\n`);
}

main();
