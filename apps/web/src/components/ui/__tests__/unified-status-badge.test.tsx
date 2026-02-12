import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { UnifiedStatusBadge } from '../unified-status-badge';

// ---------------------------------------------------------------------------
// Helpers -- lightweight render/query without @testing-library/react
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

function getByText(text: string): HTMLElement {
  const walk = (node: Node): HTMLElement | null => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === text) {
      return node.parentElement;
    }
    for (const child of Array.from(node.childNodes)) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  const el = walk(container);
  if (!el) throw new Error(`Text "${text}" not found in rendered output`);
  return el;
}

function queryByText(text: string): HTMLElement | null {
  try {
    return getByText(text);
  } catch {
    return null;
  }
}

afterEach(() => {
  flushSync(() => {
    root?.unmount();
  });
  container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnifiedStatusBadge', () => {
  describe('execution domain', () => {
    it('renders pending status with clock icon', () => {
      render(<UnifiedStatusBadge status="pending" domain="execution" />);
      expect(getByText('Pending')).toBeDefined();
    });

    it('renders running status with spinner animation', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="running" domain="execution" />,
      );
      expect(getByText('Running')).toBeDefined();
      expect(c.querySelector('.animate-spin')).not.toBeNull();
    });

    it('renders completed status', () => {
      render(<UnifiedStatusBadge status="completed" domain="execution" />);
      expect(getByText('Completed')).toBeDefined();
    });

    it('renders failed status', () => {
      render(<UnifiedStatusBadge status="failed" domain="execution" />);
      expect(getByText('Failed')).toBeDefined();
    });

    it('renders cancelled status', () => {
      render(<UnifiedStatusBadge status="cancelled" domain="execution" />);
      expect(getByText('Cancelled')).toBeDefined();
    });
  });

  describe('lifecycle domain', () => {
    it('renders draft status', () => {
      render(<UnifiedStatusBadge status="draft" domain="lifecycle" />);
      expect(getByText('Draft')).toBeDefined();
    });

    it('renders active status', () => {
      render(<UnifiedStatusBadge status="active" domain="lifecycle" />);
      expect(getByText('Active')).toBeDefined();
    });

    it('renders paused status', () => {
      render(<UnifiedStatusBadge status="paused" domain="lifecycle" />);
      expect(getByText('Paused')).toBeDefined();
    });

    it('renders error status', () => {
      render(<UnifiedStatusBadge status="error" domain="lifecycle" />);
      expect(getByText('Error')).toBeDefined();
    });
  });

  describe('connection domain', () => {
    it('renders connected badge with emerald color', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="connected" domain="connection" />,
      );
      expect(getByText('Connected')).toBeDefined();
      const firstChild = c.firstElementChild;
      expect(firstChild?.className).toContain('bg-emerald');
    });

    it('renders error status without crashing', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="error" domain="connection" />,
      );
      expect(c.firstElementChild).not.toBeNull();
    });
  });

  describe('variant prop', () => {
    it('renders dot variant without text', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="completed" domain="execution" variant="dot" />,
      );
      expect(queryByText('Completed')).toBeNull();
      expect(c.querySelector('.rounded-full')).not.toBeNull();
    });

    it('renders icon-only variant without text', () => {
      render(
        <UnifiedStatusBadge status="completed" domain="execution" variant="icon-only" />,
      );
      expect(queryByText('Completed')).toBeNull();
    });

    it('renders badge variant with text', () => {
      render(
        <UnifiedStatusBadge status="completed" domain="execution" variant="badge" />,
      );
      expect(getByText('Completed')).toBeDefined();
    });
  });

  describe('size prop', () => {
    it('renders sm size', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="completed" domain="execution" size="sm" />,
      );
      expect(c.firstElementChild?.className).toContain('text-[10px]');
    });

    it('renders default size', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="completed" domain="execution" />,
      );
      expect(c.firstElementChild?.className).toContain('text-xs');
    });
  });

  describe('edge cases', () => {
    it('returns null for unknown status', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status={'unknown' as never} domain="execution" />,
      );
      expect(c.firstElementChild).toBeNull();
    });

    it('applies custom className', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="running" domain="execution" className="my-custom" />,
      );
      expect(c.firstElementChild?.className).toContain('my-custom');
    });

    it('renders xs size', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="completed" domain="execution" size="xs" />,
      );
      expect(c.firstElementChild?.className).toContain('text-[10px]');
    });
  });

  describe('stream domain', () => {
    it('renders idle status', () => {
      render(<UnifiedStatusBadge status="idle" domain="stream" />);
      expect(getByText('Ready')).toBeDefined();
    });

    it('renders connecting status with spinner', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="connecting" domain="stream" />,
      );
      expect(getByText('Connecting')).toBeDefined();
      expect(c.querySelector('.animate-spin')).not.toBeNull();
    });

    it('renders streaming status with pulse animation', () => {
      const { container: c } = render(
        <UnifiedStatusBadge status="streaming" domain="stream" />,
      );
      expect(getByText('Streaming')).toBeDefined();
      expect(c.querySelector('.animate-pulse')).not.toBeNull();
    });

    it('renders complete status', () => {
      render(<UnifiedStatusBadge status="complete" domain="stream" />);
      expect(getByText('Complete')).toBeDefined();
    });
  });
});
