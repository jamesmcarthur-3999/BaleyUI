import { describe, it, expect } from 'vitest';
import {
  BuilderEventSchema,
  isBuilderEvent,
  getEventEntityInfo,
  type BuilderEvent,
  type Actor,
} from '@/lib/events/types';

describe('BuilderEvent Types', () => {
  const mockUserActor: Actor = {
    type: 'user',
    userId: 'usr_123',
  };

  const mockAIActor: Actor = {
    type: 'ai-agent',
    agentId: 'agt_onboarding',
    agentName: 'Onboarding Assistant',
  };

  describe('BlockCreated event', () => {
    it('validates a valid BlockCreated event', () => {
      const event = {
        type: 'BlockCreated' as const,
        id: 'evt_123',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          blockId: 'blk_123',
          name: 'My Block',
          blockType: 'ai' as const,
        },
      };

      expect(isBuilderEvent(event)).toBe(true);
      const result = BuilderEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects an invalid BlockCreated event', () => {
      const event = {
        type: 'BlockCreated',
        // Missing required fields
      };

      expect(isBuilderEvent(event)).toBe(false);
    });
  });

  describe('AI actor events', () => {
    it('validates events from AI agents', () => {
      const event: BuilderEvent = {
        type: 'FlowNodeAdded',
        id: 'evt_124',
        timestamp: new Date(),
        actor: mockAIActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          flowId: 'flw_123',
          nodeId: 'nd_123',
          nodeType: 'ai-block',
          position: { x: 100, y: 200 },
        },
      };

      expect(isBuilderEvent(event)).toBe(true);
    });
  });

  describe('getEventEntityInfo', () => {
    it('extracts block entity info', () => {
      const event: BuilderEvent = {
        type: 'BlockUpdated',
        id: 'evt_125',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          blockId: 'blk_456',
          changes: { name: 'New Name' },
        },
      };

      const info = getEventEntityInfo(event);
      expect(info.entityType).toBe('block');
      expect(info.entityId).toBe('blk_456');
    });

    it('extracts flow entity info', () => {
      const event: BuilderEvent = {
        type: 'FlowCreated',
        id: 'evt_126',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          flowId: 'flw_789',
          name: 'My Flow',
        },
      };

      const info = getEventEntityInfo(event);
      expect(info.entityType).toBe('flow');
      expect(info.entityId).toBe('flw_789');
    });

    it('extracts connection entity info', () => {
      const event: BuilderEvent = {
        type: 'ConnectionCreated',
        id: 'evt_127',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          connectionId: 'conn_abc',
          provider: 'openai',
          name: 'OpenAI Connection',
        },
      };

      const info = getEventEntityInfo(event);
      expect(info.entityType).toBe('connection');
      expect(info.entityId).toBe('conn_abc');
    });

    it('extracts tool entity info', () => {
      const event: BuilderEvent = {
        type: 'ToolCreated',
        id: 'evt_128',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          toolId: 'tool_xyz',
          name: 'Query Database',
          description: 'Runs SQL queries',
        },
      };

      const info = getEventEntityInfo(event);
      expect(info.entityType).toBe('tool');
      expect(info.entityId).toBe('tool_xyz');
    });
  });

  describe('Flow edge events', () => {
    it('validates FlowEdgeAdded with handles', () => {
      const event: BuilderEvent = {
        type: 'FlowEdgeAdded',
        id: 'evt_129',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          flowId: 'flw_123',
          edgeId: 'edge_001',
          sourceNodeId: 'nd_source',
          targetNodeId: 'nd_target',
          sourceHandle: 'output',
          targetHandle: 'input',
        },
      };

      expect(isBuilderEvent(event)).toBe(true);
    });

    it('validates FlowEdgeAdded without handles', () => {
      const event: BuilderEvent = {
        type: 'FlowEdgeAdded',
        id: 'evt_130',
        timestamp: new Date(),
        actor: mockUserActor,
        workspaceId: 'ws_123',
        version: 1,
        data: {
          flowId: 'flw_123',
          edgeId: 'edge_002',
          sourceNodeId: 'nd_source',
          targetNodeId: 'nd_target',
        },
      };

      expect(isBuilderEvent(event)).toBe(true);
    });
  });
});
