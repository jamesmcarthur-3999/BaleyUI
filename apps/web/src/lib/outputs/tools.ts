/**
 * AI Output Tools
 *
 * Tools that AI agents can use to emit structured output artifacts.
 * These tools follow the Vercel AI SDK tool definition pattern.
 */

import { z } from 'zod';
import type {
  OutputArtifact,
  OutputData,
  ChartConfig,
  MetricCardConfig,
  InsightCardConfig,
  DataTableConfig,
  TextBlockConfig,
  ActionCardConfig,
  OutputTemplateType,
} from './types';

// ============================================================================
// TOOL SCHEMAS
// ============================================================================

/**
 * Schema for emitting a metric
 */
export const EmitMetricSchema = z.object({
  id: z.string().describe('Unique identifier for this metric'),
  title: z.string().describe('Display title for the metric'),
  value: z.union([z.string(), z.number()]).describe('The metric value'),
  change: z
    .object({
      value: z.number().describe('Percentage change'),
      direction: z.enum(['up', 'down', 'neutral']).describe('Direction of change'),
      period: z.string().optional().describe('Time period for comparison (e.g., "vs last week")'),
    })
    .optional()
    .describe('Optional change indicator'),
  color: z
    .enum(['default', 'success', 'warning', 'error'])
    .optional()
    .describe('Visual color coding'),
  subtitle: z.string().optional().describe('Additional context below the value'),
});

/**
 * Schema for emitting a chart
 */
export const EmitChartSchema = z.object({
  id: z.string().describe('Unique identifier for this chart'),
  type: z.enum(['line', 'bar', 'pie', 'donut', 'area', 'scatter']).describe('Chart type'),
  title: z.string().optional().describe('Chart title'),
  data: z
    .array(
      z.object({
        label: z.string().describe('Data point label'),
        value: z.number().describe('Data point value'),
        category: z.string().optional().describe('Optional grouping category'),
      })
    )
    .describe('Chart data points'),
  colors: z.array(z.string()).optional().describe('Custom color palette'),
});

/**
 * Schema for emitting an insight
 */
export const EmitInsightSchema = z.object({
  id: z.string().describe('Unique identifier for this insight'),
  title: z.string().describe('Insight headline'),
  description: z.string().describe('Detailed explanation of the insight'),
  severity: z.enum(['info', 'success', 'warning', 'critical']).describe('Importance level'),
  evidence: z
    .array(z.string())
    .optional()
    .describe('Supporting data points or facts'),
  recommendations: z
    .array(z.string())
    .optional()
    .describe('Suggested actions based on this insight'),
});

/**
 * Schema for emitting a data table
 */
export const EmitTableSchema = z.object({
  id: z.string().describe('Unique identifier for this table'),
  title: z.string().optional().describe('Table title'),
  columns: z
    .array(
      z.object({
        key: z.string().describe('Column data key'),
        header: z.string().describe('Column header text'),
        type: z
          .enum(['string', 'number', 'date', 'currency', 'percentage', 'badge'])
          .optional()
          .describe('Data type for formatting'),
        sortable: z.boolean().optional().describe('Allow sorting by this column'),
      })
    )
    .describe('Table column definitions'),
  data: z.array(z.record(z.string(), z.unknown())).describe('Table row data'),
  pagination: z
    .object({
      enabled: z.boolean(),
      pageSize: z.number(),
    })
    .optional()
    .describe('Pagination settings'),
});

/**
 * Schema for emitting a text block
 */
export const EmitTextSchema = z.object({
  id: z.string().describe('Unique identifier for this text block'),
  content: z.string().describe('Text content'),
  format: z.enum(['plain', 'markdown', 'html']).default('markdown').describe('Content format'),
  variant: z
    .enum(['default', 'callout', 'quote', 'code'])
    .optional()
    .describe('Visual style variant'),
});

/**
 * Schema for emitting an action/recommendation card
 */
export const EmitActionSchema = z.object({
  id: z.string().describe('Unique identifier for this action'),
  title: z.string().describe('Action title'),
  description: z.string().describe('What this action entails'),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .optional()
    .describe('Priority level'),
  actions: z
    .array(
      z.object({
        label: z.string().describe('Button text'),
        type: z.enum(['primary', 'secondary', 'link']).describe('Button style'),
        href: z.string().optional().describe('URL for link buttons'),
      })
    )
    .describe('Available actions'),
});

/**
 * Schema for creating a complete output artifact
 */
export const CreateOutputArtifactSchema = z.object({
  type: z
    .enum(['report', 'dashboard', 'data-table', 'chat', 'custom'])
    .describe('Output template type'),
  title: z.string().describe('Artifact title'),
  description: z.string().optional().describe('Artifact description'),
});

// ============================================================================
// TOOL DEFINITIONS (for AI SDK)
// ============================================================================

/**
 * Tool definitions following Vercel AI SDK format
 */
export const outputTools = {
  emit_metric: {
    description:
      'Emit a metric card showing a KPI with optional trend indicator. Use for displaying key numbers.',
    parameters: EmitMetricSchema,
  },

  emit_chart: {
    description:
      'Emit a data visualization chart. Supports line, bar, pie, donut, area, and scatter charts.',
    parameters: EmitChartSchema,
  },

  emit_insight: {
    description:
      'Emit an insight card highlighting a key finding with severity and optional recommendations.',
    parameters: EmitInsightSchema,
  },

  emit_table: {
    description:
      'Emit a data table with sortable columns and optional pagination. Use for detailed data displays.',
    parameters: EmitTableSchema,
  },

  emit_text: {
    description:
      'Emit a text block for narrative content. Supports plain text, markdown, and styled variants.',
    parameters: EmitTextSchema,
  },

  emit_action: {
    description:
      'Emit an action card with recommendations and clickable actions. Use for suggesting next steps.',
    parameters: EmitActionSchema,
  },

  create_output: {
    description:
      'Create a new output artifact container. Call this first, then emit components to populate it.',
    parameters: CreateOutputArtifactSchema,
  },
} as const;

// ============================================================================
// OUTPUT BUILDER
// ============================================================================

/**
 * Builder class for constructing OutputArtifact from tool calls
 */
export class OutputBuilder {
  private artifact: Partial<OutputArtifact>;
  private data: OutputData;

  constructor() {
    this.artifact = {
      id: `output-${Date.now()}`,
      createdAt: new Date(),
    };
    this.data = {};
  }

  /**
   * Initialize the output artifact
   */
  createOutput(params: z.infer<typeof CreateOutputArtifactSchema>): this {
    this.artifact.type = params.type;
    this.artifact.title = params.title;
    this.artifact.description = params.description;
    return this;
  }

  /**
   * Set creator information
   */
  setCreator(creator: OutputArtifact['createdBy']): this {
    this.artifact.createdBy = creator;
    return this;
  }

  /**
   * Set metadata
   */
  setMetadata(metadata: OutputArtifact['metadata']): this {
    this.artifact.metadata = metadata;
    return this;
  }

  /**
   * Add a metric
   */
  emitMetric(params: z.infer<typeof EmitMetricSchema>): this {
    const config: MetricCardConfig = {
      title: params.title,
      value: params.value,
      change: params.change,
      color: params.color,
      subtitle: params.subtitle,
    };
    this.data.metrics = this.data.metrics ?? {};
    this.data.metrics[params.id] = config;
    return this;
  }

  /**
   * Add a chart
   */
  emitChart(params: z.infer<typeof EmitChartSchema>): this {
    const config: ChartConfig = {
      type: params.type,
      title: params.title,
      data: params.data,
      colors: params.colors,
    };
    this.data.charts = this.data.charts ?? {};
    this.data.charts[params.id] = config;
    return this;
  }

  /**
   * Add an insight
   */
  emitInsight(params: z.infer<typeof EmitInsightSchema>): this {
    const config: InsightCardConfig = {
      title: params.title,
      description: params.description,
      severity: params.severity,
      evidence: params.evidence,
      recommendations: params.recommendations,
    };
    this.data.insights = this.data.insights ?? {};
    this.data.insights[params.id] = config;
    return this;
  }

  /**
   * Add a data table
   */
  emitTable(params: z.infer<typeof EmitTableSchema>): this {
    const config: DataTableConfig = {
      columns: params.columns,
      data: params.data,
      pagination: params.pagination,
    };
    this.data.tables = this.data.tables ?? {};
    this.data.tables[params.id] = config;
    return this;
  }

  /**
   * Add a text block
   */
  emitText(params: z.infer<typeof EmitTextSchema>): this {
    const config: TextBlockConfig = {
      content: params.content,
      format: params.format,
      variant: params.variant,
    };
    this.data.text = this.data.text ?? {};
    this.data.text[params.id] = config;
    return this;
  }

  /**
   * Add an action card
   */
  emitAction(params: z.infer<typeof EmitActionSchema>): this {
    const config: ActionCardConfig = {
      title: params.title,
      description: params.description,
      priority: params.priority,
      actions: params.actions,
    };
    this.data.actions = this.data.actions ?? {};
    this.data.actions[params.id] = config;
    return this;
  }

  /**
   * Build the final artifact
   */
  build(): OutputArtifact {
    if (!this.artifact.type) {
      throw new Error('Output type is required. Call createOutput first.');
    }
    if (!this.artifact.title) {
      throw new Error('Output title is required. Call createOutput first.');
    }
    if (!this.artifact.createdBy) {
      throw new Error('Creator is required. Call setCreator first.');
    }

    return {
      id: this.artifact.id!,
      type: this.artifact.type,
      title: this.artifact.title,
      description: this.artifact.description,
      createdAt: this.artifact.createdAt!,
      createdBy: this.artifact.createdBy,
      layout: {
        type: 'stack',
        gap: 6,
        sections: [],
      },
      data: this.data,
      metadata: this.artifact.metadata,
    };
  }
}

// ============================================================================
// TOOL HANDLER
// ============================================================================

/**
 * Handle tool calls from AI and accumulate into OutputBuilder
 */
export function handleOutputToolCall(
  builder: OutputBuilder,
  toolName: string,
  args: unknown
): void {
  switch (toolName) {
    case 'create_output':
      builder.createOutput(CreateOutputArtifactSchema.parse(args));
      break;
    case 'emit_metric':
      builder.emitMetric(EmitMetricSchema.parse(args));
      break;
    case 'emit_chart':
      builder.emitChart(EmitChartSchema.parse(args));
      break;
    case 'emit_insight':
      builder.emitInsight(EmitInsightSchema.parse(args));
      break;
    case 'emit_table':
      builder.emitTable(EmitTableSchema.parse(args));
      break;
    case 'emit_text':
      builder.emitText(EmitTextSchema.parse(args));
      break;
    case 'emit_action':
      builder.emitAction(EmitActionSchema.parse(args));
      break;
    default:
      throw new Error(`Unknown output tool: ${toolName}`);
  }
}
