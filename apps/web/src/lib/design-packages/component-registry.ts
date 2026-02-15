/**
 * Component Registry Helpers
 *
 * Utilities for working with the ComponentRegistry: creating, merging,
 * upserting components, and formatting for AI consumption.
 */

import type {
  ComponentRegistry,
  ComponentDefinition,
  ComponentCategory,
  DesignPackageData,
  TailwindThemeTokens,
} from './types';

/** Create an empty registry */
export function createEmptyRegistry(): ComponentRegistry {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    generationMethod: 'parallel-agents',
    components: [],
  };
}

/** Upsert a component into the registry by name (replace if exists) */
export function upsertComponent(
  registry: ComponentRegistry,
  component: ComponentDefinition
): ComponentRegistry {
  const existing = registry.components.findIndex(
    (c) => c.name.toLowerCase() === component.name.toLowerCase()
  );

  const components = [...registry.components];
  if (existing >= 0) {
    components[existing] = component;
  } else {
    components.push(component);
  }

  return { ...registry, components };
}

/** Get all components for a category */
export function getComponentsByCategory(
  registry: ComponentRegistry,
  category: ComponentCategory
): ComponentDefinition[] {
  return registry.components.filter((c) => c.category === category);
}

/** The 27 default components grouped by category */
export const DEFAULT_COMPONENT_SET: Array<{
  category: ComponentCategory;
  components: string[];
}> = [
  { category: 'action', components: ['Button', 'IconButton', 'ButtonGroup', 'DropdownMenu'] },
  { category: 'layout', components: ['Card', 'Section', 'Separator', 'Sidebar', 'DashboardShell'] },
  { category: 'form', components: ['Input', 'Select', 'Textarea', 'Checkbox', 'Switch'] },
  { category: 'data', components: ['Table', 'Badge', 'Avatar', 'Progress', 'Stat'] },
  { category: 'feedback', components: ['Alert', 'Toast', 'Skeleton'] },
  { category: 'navigation', components: ['Tabs', 'Breadcrumb', 'Pagination'] },
  { category: 'overlay', components: ['Dialog', 'Tooltip'] },
];

/**
 * Format the component registry as a markdown brief for AI consumption.
 * This is used by the get_design_package tool's 'brief' format.
 */
export function formatRegistryBrief(registry: ComponentRegistry): string {
  if (registry.components.length === 0) {
    return '## Component Library\nNo components generated yet.';
  }

  const lines: string[] = ['## Component Library'];

  // Group by category
  const byCategory = new Map<string, ComponentDefinition[]>();
  for (const comp of registry.components) {
    const list = byCategory.get(comp.category) ?? [];
    list.push(comp);
    byCategory.set(comp.category, list);
  }

  for (const [category, components] of byCategory) {
    lines.push(`\n### ${category.charAt(0).toUpperCase() + category.slice(1)}`);

    for (const comp of components) {
      lines.push(`\n**${comp.name}**`);
      for (const v of comp.variants) {
        const parts = [`- **${v.name}**: \`${v.classes}\``];
        if (v.animations?.hover) parts.push(`| hover: \`${v.animations.hover}\``);
        if (v.customCSS) parts.push(`| ${v.customCSS}`);
        parts.push(`-- ${v.usage}`);
        lines.push(parts.join(' '));
        if (v.designNotes) {
          lines.push(`  _${v.designNotes}_`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a design package + theme tokens as a complete design brief for AI consumption.
 * Used by the get_design_package tool's 'brief' format.
 */
export function formatDesignBrief(
  name: string,
  data: DesignPackageData,
  theme: TailwindThemeTokens,
  registry?: ComponentRegistry
): string {
  const lines: string[] = [
    `# Design System: ${name}`,
    `Mood: ${data.mood} | Radius: ${data.borderRadius} | Animation: ${data.animationStyle}`,
    `Font: ${data.typography.fontFamily}${data.typography.fontFamilyHeading ? ` | Heading: ${data.typography.fontFamilyHeading}` : ''}`,
    `Default shadow: ${theme.defaultShadow}`,
    `Default transition: ${theme.defaultTransition}`,
    `Hover scale: ${theme.defaultHoverScale}`,
    '',
    '## Color Tokens',
    '| Role | Light | Dark | Usage |',
    '|------|-------|------|-------|',
  ];

  const colorRoles: Array<{ key: string; usage: string }> = [
    { key: 'primary', usage: 'CTAs, links, focus rings' },
    { key: 'primaryForeground', usage: 'Text on primary backgrounds' },
    { key: 'secondary', usage: 'Secondary buttons, tags' },
    { key: 'background', usage: 'Page background' },
    { key: 'foreground', usage: 'Primary text' },
    { key: 'card', usage: 'Card backgrounds' },
    { key: 'muted', usage: 'Subdued backgrounds' },
    { key: 'accent', usage: 'Highlights, hover states' },
    { key: 'destructive', usage: 'Delete, error actions' },
    { key: 'border', usage: 'Borders, dividers' },
  ];

  for (const { key, usage } of colorRoles) {
    const light = (data.colors.light as unknown as Record<string, string>)[key] ?? '';
    const dark = (data.colors.dark as unknown as Record<string, string>)[key] ?? '';
    lines.push(`| ${key} | ${light} | ${dark} | ${usage} |`);
  }

  if (data.foundation) {
    lines.push('');
    lines.push('## Foundation');
    lines.push(`- Brand personality: ${data.foundation.brandPersonality}`);
    lines.push(`- Voice tone: ${data.foundation.voiceTone}`);
    lines.push(`- Accessibility target: ${data.foundation.accessibilityTarget.toUpperCase()}`);
    lines.push(`- Brand alignment: ${Math.round(data.foundation.brandAlignment * 100)}%`);
    lines.push(`- Principles: ${data.foundation.designPrinciples.join(' | ')}`);
  }

  if (data.motionSystem) {
    lines.push('');
    lines.push('## Motion System');
    lines.push(`- Intensity: ${data.motionSystem.intensity}`);
    lines.push(`- Transition style: ${data.motionSystem.transitionStyle}`);
    lines.push(`- Easing: ${data.motionSystem.easingPreset}`);
    lines.push(
      `- Duration scale: fast ${data.motionSystem.durationScale.fastMs}ms | normal ${data.motionSystem.durationScale.normalMs}ms | slow ${data.motionSystem.durationScale.slowMs}ms`
    );
    lines.push(`- Reduced motion: ${data.motionSystem.reducedMotionStrategy}`);
  }

  if (data.layoutSystem) {
    lines.push('');
    lines.push('## Layout System');
    lines.push(`- Density: ${data.layoutSystem.density}`);
    lines.push(`- Spacing base: ${data.layoutSystem.spacingBasePx}px`);
    lines.push(`- Grid: ${data.layoutSystem.grid.columns} columns, ${data.layoutSystem.grid.gutterPx}px gutters`);
    lines.push(
      `- Navigation patterns: landing=${data.layoutSystem.navigationPattern.landing}, customer=${data.layoutSystem.navigationPattern.customerApp}, internal=${data.layoutSystem.navigationPattern.internalApp}`
    );
    lines.push(
      `- Content width: landing=${data.layoutSystem.contentWidth.landing}, customer=${data.layoutSystem.contentWidth.customerApp}, internal=${data.layoutSystem.contentWidth.internalApp}`
    );
  }

  if (data.surfaceBlueprints) {
    lines.push('');
    lines.push('## Surface Blueprints');
    const surfaces: Array<['landing' | 'customerApp' | 'internalApp', string]> = [
      ['landing', 'Landing'],
      ['customerApp', 'Customer App'],
      ['internalApp', 'Internal App'],
    ];
    for (const [key, label] of surfaces) {
      const blueprint = data.surfaceBlueprints[key];
      lines.push(`- ${label}: ${blueprint.purpose}`);
      lines.push(`  Layout: ${blueprint.layoutSummary}`);
      lines.push(
        `  Section priorities: ${blueprint.sectionOrder
          .map((section) => `${section.id}(p${section.priority})`)
          .join(', ')}`
      );
      lines.push(`  Prompt seed: ${blueprint.samplePrompt}`);
    }
  }

  if (registry) {
    lines.push('');
    lines.push(formatRegistryBrief(registry));
  }

  lines.push('');
  lines.push('## Design Principles');
  lines.push(`- ${data.mood}-driven design`);
  lines.push(`- Shadows: ${theme.defaultShadow}`);
  lines.push(`- Motion: ${theme.defaultTransition}`);
  lines.push('- Dark mode: All components must work with both modes. Use semantic colors only.');

  return lines.join('\n');
}
