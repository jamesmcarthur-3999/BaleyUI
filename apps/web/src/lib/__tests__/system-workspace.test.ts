import { describe, it, expect, vi } from 'vitest';
import { getOrCreateSystemWorkspace, SYSTEM_WORKSPACE_SLUG } from '../system-workspace';

// Mock the database
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      workspaces: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'system-ws-id', slug: '__system__' }]),
      }),
    }),
  },
  workspaces: {},
  eq: vi.fn(),
  notDeleted: vi.fn(),
}));

describe('system-workspace', () => {
  it('exports SYSTEM_WORKSPACE_SLUG constant', () => {
    expect(SYSTEM_WORKSPACE_SLUG).toBe('__system__');
  });

  it('getOrCreateSystemWorkspace returns workspace id', async () => {
    const wsId = await getOrCreateSystemWorkspace();
    expect(typeof wsId).toBe('string');
  });
});
