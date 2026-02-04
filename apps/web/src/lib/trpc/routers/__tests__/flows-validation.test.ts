/**
 * Flow Schema Validation Tests
 *
 * Tests for strict Zod validation of flow nodes, edges, and triggers.
 */

import { describe, it, expect } from 'vitest';
import {
  flowNodeSchema,
  flowEdgeSchema,
  flowTriggerSchema,
} from '../flows';

describe('Flow validation schemas', () => {
  describe('flowNodeSchema', () => {
    it('should reject nodes without required fields', () => {
      const invalidNodes = [
        {}, // missing everything
        { id: 'test' }, // missing type, position
        { id: 'test', type: 'baleybot' }, // missing position
        { id: 'test', type: 'invalid-type', position: { x: 0, y: 0 } }, // invalid type
      ];

      for (const node of invalidNodes) {
        expect(() => flowNodeSchema.parse(node)).toThrow();
      }
    });

    it('should accept valid node structures', () => {
      const validNode = {
        id: 'node-1',
        type: 'baleybot',
        position: { x: 100, y: 200 },
        data: { baleybotId: '123e4567-e89b-12d3-a456-426614174000', label: 'My Bot' },
      };

      expect(() => flowNodeSchema.parse(validNode)).not.toThrow();
      const parsed = flowNodeSchema.parse(validNode);
      expect(parsed.id).toBe('node-1');
      expect(parsed.type).toBe('baleybot');
    });

    it('should accept nodes without optional data field', () => {
      const minimalNode = {
        id: 'node-2',
        type: 'trigger',
        position: { x: 0, y: 0 },
      };

      expect(() => flowNodeSchema.parse(minimalNode)).not.toThrow();
    });

    it('should accept React Flow optional fields', () => {
      const nodeWithReactFlowFields = {
        id: 'node-3',
        type: 'condition',
        position: { x: 50, y: 100 },
        width: 200,
        height: 100,
        selected: true,
        dragging: false,
      };

      expect(() => flowNodeSchema.parse(nodeWithReactFlowFields)).not.toThrow();
    });

    it('should reject empty id', () => {
      const emptyIdNode = {
        id: '',
        type: 'baleybot',
        position: { x: 0, y: 0 },
      };

      expect(() => flowNodeSchema.parse(emptyIdNode)).toThrow();
    });
  });

  describe('flowEdgeSchema', () => {
    it('should reject edges without required connections', () => {
      const invalidEdges = [
        {}, // missing everything
        { id: 'e1' }, // missing source/target
        { id: 'e1', source: 'n1' }, // missing target
        { id: 'e1', target: 'n2' }, // missing source
        { id: '', source: 'n1', target: 'n2' }, // empty id
      ];

      for (const edge of invalidEdges) {
        expect(() => flowEdgeSchema.parse(edge)).toThrow();
      }
    });

    it('should accept valid edge structures', () => {
      const validEdge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
      };

      expect(() => flowEdgeSchema.parse(validEdge)).not.toThrow();
      const parsed = flowEdgeSchema.parse(validEdge);
      expect(parsed.id).toBe('edge-1');
      expect(parsed.source).toBe('node-1');
      expect(parsed.target).toBe('node-2');
    });

    it('should accept edges with optional fields', () => {
      const edgeWithOptionals = {
        id: 'edge-2',
        source: 'node-1',
        target: 'node-2',
        sourceHandle: 'output-1',
        targetHandle: 'input-1',
        type: 'smoothstep',
        animated: true,
        label: 'on success',
      };

      expect(() => flowEdgeSchema.parse(edgeWithOptionals)).not.toThrow();
    });
  });

  describe('flowTriggerSchema', () => {
    it('should reject triggers without required fields', () => {
      const invalidTriggers = [
        {}, // missing everything
        { id: 'trigger-1' }, // missing type, nodeId
        { id: 'trigger-1', type: 'manual' }, // missing nodeId
        { id: 'trigger-1', type: 'invalid-type', nodeId: 'node-1' }, // invalid type
      ];

      for (const trigger of invalidTriggers) {
        expect(() => flowTriggerSchema.parse(trigger)).toThrow();
      }
    });

    it('should accept valid trigger structures', () => {
      const validTriggers = [
        { id: 't1', type: 'manual', nodeId: 'node-1' },
        { id: 't2', type: 'schedule', nodeId: 'node-1', config: { schedule: '0 * * * *' } },
        { id: 't3', type: 'webhook', nodeId: 'node-1', config: { webhookPath: '/api/trigger' } },
        { id: 't4', type: 'event', nodeId: 'node-1', config: { eventName: 'user.created' } },
      ];

      for (const trigger of validTriggers) {
        expect(() => flowTriggerSchema.parse(trigger)).not.toThrow();
      }
    });

    it('should accept triggers without optional config', () => {
      const minimalTrigger = {
        id: 'trigger-1',
        type: 'manual',
        nodeId: 'node-1',
      };

      expect(() => flowTriggerSchema.parse(minimalTrigger)).not.toThrow();
    });
  });
});
