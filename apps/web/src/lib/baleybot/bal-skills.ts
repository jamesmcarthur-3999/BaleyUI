/**
 * BAL Skill Detection
 *
 * Detects composition/runtime capabilities from BAL code so UI layers
 * can explain what patterns are active in a workflow.
 */

export type BalSkillId =
  | 'chain'
  | 'parallel'
  | 'loop'
  | 'if_else'
  | 'try_catch'
  | 'route'
  | 'gate'
  | 'filter'
  | 'processor';

export interface BalSkillDescriptor {
  id: BalSkillId;
  label: string;
  description: string;
}

const BAL_SKILLS: BalSkillDescriptor[] = [
  {
    id: 'chain',
    label: 'Chain',
    description: 'Runs entities sequentially in a pipeline.',
  },
  {
    id: 'parallel',
    label: 'Parallel',
    description: 'Runs entities concurrently.',
  },
  {
    id: 'loop',
    label: 'Loop',
    description: 'Repeats a step until a stop condition or max cycle.',
  },
  {
    id: 'if_else',
    label: 'Conditional',
    description: 'Branches logic with if/else paths.',
  },
  {
    id: 'try_catch',
    label: 'Try/Catch',
    description: 'Adds fallback behavior for failure paths.',
  },
  {
    id: 'route',
    label: 'Route',
    description: 'Dispatches work by classifier key.',
  },
  {
    id: 'gate',
    label: 'Gate',
    description: 'Conditionally executes a stage.',
  },
  {
    id: 'filter',
    label: 'Filter',
    description: 'Filters items before processing.',
  },
  {
    id: 'processor',
    label: 'Processor',
    description: 'Performs deterministic data transformation.',
  },
];

const SKILL_MATCHERS: Record<BalSkillId, RegExp> = {
  chain: /\bchain\s*\{/i,
  parallel: /\bparallel\s*\{/i,
  loop: /\bloop\s*(?:\([^)]*\))?\s*\{/i,
  if_else: /\bif\s*\(/i,
  try_catch: /\btry\s*(?:\([^)]*\))?\s*\{/i,
  route: /\broute\s*\(/i,
  gate: /\bgate\s*\(/i,
  filter: /\bfilter\s*\(/i,
  processor: /\bprocessor\s*\(/i,
};

export function detectBalSkills(balCode: string): BalSkillId[] {
  if (!balCode.trim()) return [];

  const detected: BalSkillId[] = [];
  for (const skill of BAL_SKILLS) {
    if (SKILL_MATCHERS[skill.id].test(balCode)) {
      detected.push(skill.id);
    }
  }
  return detected;
}

export function getBalSkillDescriptor(skillId: BalSkillId): BalSkillDescriptor {
  return (
    BAL_SKILLS.find((skill) => skill.id === skillId) ?? {
      id: skillId,
      label: skillId,
      description: '',
    }
  );
}

export function summarizeBalSkills(skillIds: BalSkillId[]): string {
  if (skillIds.length === 0) {
    return 'single-step execution';
  }
  const labels = skillIds.map((id) => getBalSkillDescriptor(id).label.toLowerCase());
  if (labels.length === 1) {
    return `${labels[0]} pattern`;
  }
  if (labels.length === 2) {
    return `${labels[0]} + ${labels[1]} patterns`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]} patterns`;
}

