/**
 * Output System Integration Tests
 *
 * Tests the output template system, tools, and component integration.
 */

import { describe, it, expect } from 'vitest';
import {
  OutputBuilder,
  handleOutputToolCall,
  EmitMetricSchema,
  EmitChartSchema,
  EmitInsightSchema,
  EmitTableSchema,
} from '@/lib/outputs/tools';
import { templates, getTemplate, listTemplates } from '@/lib/outputs/templates';

// ============================================================================
// OUTPUT BUILDER TESTS
// ============================================================================

describe('OutputBuilder', () => {
  it('creates an output artifact with metrics', () => {
    const builder = new OutputBuilder();

    builder
      .createOutput({
        type: 'report',
        title: 'Test Report',
        description: 'A test report',
      })
      .setCreator({
        type: 'ai-agent',
        id: 'test-agent',
        name: 'Test Agent',
      })
      .emitMetric({
        id: 'revenue',
        title: 'Total Revenue',
        value: 50000,
        change: { value: 12.5, direction: 'up' },
        color: 'success',
      });

    const artifact = builder.build();

    expect(artifact.type).toBe('report');
    expect(artifact.title).toBe('Test Report');
    expect(artifact.data.metrics).toBeDefined();
    expect(artifact.data.metrics?.['revenue']).toBeDefined();

    const revenue = artifact.data.metrics?.['revenue'];
    expect(revenue?.value).toBe(50000);
  });

  it('creates an output artifact with charts', () => {
    const builder = new OutputBuilder();

    builder
      .createOutput({
        type: 'dashboard',
        title: 'Test Dashboard',
      })
      .setCreator({
        type: 'user',
        id: 'user-1',
        name: 'Test User',
      })
      .emitChart({
        id: 'sales-chart',
        type: 'bar',
        title: 'Sales by Month',
        data: [
          { label: 'Jan', value: 100 },
          { label: 'Feb', value: 150 },
          { label: 'Mar', value: 200 },
        ],
      });

    const artifact = builder.build();

    expect(artifact.data.charts).toBeDefined();
    expect(artifact.data.charts?.['sales-chart']).toBeDefined();

    const salesChart = artifact.data.charts?.['sales-chart'];
    expect(salesChart?.type).toBe('bar');
    expect(salesChart?.data).toHaveLength(3);
  });

  it('creates an output artifact with insights', () => {
    const builder = new OutputBuilder();

    builder
      .createOutput({
        type: 'report',
        title: 'Analysis Report',
      })
      .setCreator({
        type: 'ai-agent',
        id: 'analyst',
        name: 'Analyst Agent',
      })
      .emitInsight({
        id: 'key-finding',
        title: 'Sales Trend',
        description: 'Sales have increased 25% this quarter',
        severity: 'success',
        evidence: ['Q4 revenue: $1.2M', 'Q3 revenue: $960K'],
        recommendations: ['Continue current strategy', 'Invest in marketing'],
      });

    const artifact = builder.build();

    expect(artifact.data.insights).toBeDefined();
    expect(artifact.data.insights?.['key-finding']).toBeDefined();

    const keyFinding = artifact.data.insights?.['key-finding'];
    expect(keyFinding?.severity).toBe('success');
  });

  it('throws error when type is not set', () => {
    const builder = new OutputBuilder();

    builder.setCreator({
      type: 'user',
      id: 'user-1',
      name: 'Test User',
    });

    expect(() => builder.build()).toThrow('Output type is required');
  });

  it('throws error when creator is not set', () => {
    const builder = new OutputBuilder();

    builder.createOutput({
      type: 'report',
      title: 'Test Report',
    });

    expect(() => builder.build()).toThrow('Creator is required');
  });
});

// ============================================================================
// TOOL HANDLER TESTS
// ============================================================================

describe('handleOutputToolCall', () => {
  it('handles emit_metric tool call', () => {
    const builder = new OutputBuilder();
    builder.createOutput({ type: 'report', title: 'Test' });
    builder.setCreator({ type: 'user', id: 'u1', name: 'User' });

    handleOutputToolCall(builder, 'emit_metric', {
      id: 'test-metric',
      title: 'Test Metric',
      value: 42,
    });

    const artifact = builder.build();
    expect(artifact.data.metrics?.['test-metric']).toBeDefined();
  });

  it('handles emit_chart tool call', () => {
    const builder = new OutputBuilder();
    builder.createOutput({ type: 'dashboard', title: 'Test' });
    builder.setCreator({ type: 'user', id: 'u1', name: 'User' });

    handleOutputToolCall(builder, 'emit_chart', {
      id: 'test-chart',
      type: 'line',
      data: [{ label: 'A', value: 1 }],
    });

    const artifact = builder.build();
    expect(artifact.data.charts?.['test-chart']).toBeDefined();
  });

  it('throws error for unknown tool', () => {
    const builder = new OutputBuilder();

    expect(() => handleOutputToolCall(builder, 'unknown_tool', {})).toThrow(
      'Unknown output tool'
    );
  });
});

// ============================================================================
// TEMPLATE REGISTRY TESTS
// ============================================================================

describe('Template Registry', () => {
  it('has report template', () => {
    const report = getTemplate('report');
    expect(report).toBeDefined();
    expect(report?.type).toBe('report');
    expect(report?.defaultLayout.sections.length).toBeGreaterThan(0);
  });

  it('has dashboard template', () => {
    const dashboard = getTemplate('dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard?.type).toBe('dashboard');
    expect(dashboard?.defaultLayout.type).toBe('grid');
  });

  it('has data-table template', () => {
    const dataTable = getTemplate('data-table');
    expect(dataTable).toBeDefined();
    expect(dataTable?.type).toBe('data-table');
  });

  it('returns undefined for unknown template', () => {
    const unknown = getTemplate('unknown-template');
    expect(unknown).toBeUndefined();
  });

  it('lists all templates', () => {
    const allTemplates = listTemplates();
    expect(allTemplates.length).toBeGreaterThanOrEqual(3);
    expect(allTemplates.map((t) => t.id)).toContain('report');
    expect(allTemplates.map((t) => t.id)).toContain('dashboard');
    expect(allTemplates.map((t) => t.id)).toContain('data-table');
  });
});

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('Output Tool Schemas', () => {
  it('validates EmitMetricSchema', () => {
    const valid = EmitMetricSchema.parse({
      id: 'metric-1',
      title: 'Revenue',
      value: 50000,
      change: { value: 10, direction: 'up' },
    });

    expect(valid.id).toBe('metric-1');
    expect(valid.change?.direction).toBe('up');
  });

  it('validates EmitChartSchema', () => {
    const valid = EmitChartSchema.parse({
      id: 'chart-1',
      type: 'bar',
      data: [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
      ],
    });

    expect(valid.type).toBe('bar');
    expect(valid.data).toHaveLength(2);
  });

  it('validates EmitInsightSchema', () => {
    const valid = EmitInsightSchema.parse({
      id: 'insight-1',
      title: 'Key Finding',
      description: 'Important observation',
      severity: 'warning',
    });

    expect(valid.severity).toBe('warning');
  });

  it('validates EmitTableSchema', () => {
    const valid = EmitTableSchema.parse({
      id: 'table-1',
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'value', header: 'Value', type: 'number' },
      ],
      data: [{ name: 'Test', value: 100 }],
    });

    expect(valid.columns).toHaveLength(2);
    expect(valid.data).toHaveLength(1);
  });

  it('rejects invalid chart type', () => {
    expect(() =>
      EmitChartSchema.parse({
        id: 'chart-1',
        type: 'invalid',
        data: [],
      })
    ).toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() =>
      EmitInsightSchema.parse({
        id: 'insight-1',
        title: 'Test',
        description: 'Test',
        severity: 'invalid',
      })
    ).toThrow();
  });
});
