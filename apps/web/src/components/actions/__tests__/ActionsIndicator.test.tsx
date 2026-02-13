import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';

// ---------------------------------------------------------------------------
// Mock tRPC before importing component
// ---------------------------------------------------------------------------
const mockUseQuery = vi.fn();

vi.mock('@/lib/trpc/client', () => ({
  trpc: {
    recommendations: {
      counts: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

vi.mock('@/lib/routes', () => ({
  ROUTES: {
    actions: { list: '/dashboard/actions' },
  },
}));

// Import after mocks
const { ActionsIndicator } = await import('../ActionsIndicator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(ui);
  });
  return { container };
}

function textContent(): string {
  return container.textContent ?? '';
}

function innerHTML(): string {
  return container.innerHTML ?? '';
}

afterEach(() => {
  if (root) {
    flushSync(() => root.unmount());
  }
  container?.remove();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionsIndicator', () => {
  it('renders a link to actions page', () => {
    mockUseQuery.mockReturnValue({ data: { pending: 0, pendingBySeverity: { critical: 0 } } });

    render(<ActionsIndicator />);

    const html = innerHTML();
    expect(html).toContain('/dashboard/actions');
  });

  it('does not render count when no pending items', () => {
    mockUseQuery.mockReturnValue({ data: { pending: 0, pendingBySeverity: { critical: 0 } } });

    render(<ActionsIndicator />);

    // No numeric content beyond the icon
    expect(textContent().match(/\d+/)).toBeNull();
  });

  it('renders count when pending items exist', () => {
    mockUseQuery.mockReturnValue({
      data: { pending: 5, pendingBySeverity: { critical: 0, warning: 3, info: 2 } },
    });

    render(<ActionsIndicator />);

    expect(textContent()).toContain('5');
  });

  it('renders red background when critical items exist', () => {
    mockUseQuery.mockReturnValue({
      data: { pending: 3, pendingBySeverity: { critical: 2, warning: 1, info: 0 } },
    });

    render(<ActionsIndicator />);

    const html = innerHTML();
    expect(html).toContain('bg-red-500');
    expect(textContent()).toContain('3');
  });

  it('renders primary (non-red) background when no critical items', () => {
    mockUseQuery.mockReturnValue({
      data: { pending: 5, pendingBySeverity: { critical: 0, warning: 3, info: 2 } },
    });

    render(<ActionsIndicator />);

    const html = innerHTML();
    expect(html).toContain('bg-primary');
    expect(html).not.toContain('bg-red-500');
  });

  it('shows 99+ for large counts', () => {
    mockUseQuery.mockReturnValue({
      data: { pending: 150, pendingBySeverity: { critical: 0, warning: 50, info: 100 } },
    });

    render(<ActionsIndicator />);

    expect(textContent()).toContain('99+');
  });

  it('includes count in aria-label', () => {
    mockUseQuery.mockReturnValue({
      data: { pending: 5, pendingBySeverity: { critical: 2, warning: 2, info: 1 } },
    });

    render(<ActionsIndicator />);

    const html = innerHTML();
    expect(html).toContain('aria-label');
    expect(html).toContain('5 suggestion');
    expect(html).toContain('2 critical');
  });

  it('uses simple aria-label when no pending items', () => {
    mockUseQuery.mockReturnValue({ data: { pending: 0, pendingBySeverity: { critical: 0 } } });

    render(<ActionsIndicator />);

    const html = innerHTML();
    expect(html).toContain('aria-label');
    expect(html).toContain('Actions');
  });

  it('polls with 30s refetch interval', () => {
    mockUseQuery.mockReturnValue({ data: { pending: 0, pendingBySeverity: { critical: 0 } } });

    render(<ActionsIndicator />);

    // Check that useQuery was called with refetchInterval: 30000
    expect(mockUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ refetchInterval: 30_000 })
    );
  });
});
