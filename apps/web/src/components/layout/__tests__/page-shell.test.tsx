import React from 'react';
import { describe, it, expect } from 'vitest';
import { PageShell } from '../page-shell';

// Use react-dom/client directly (consistent with project test setup)
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return {
    container,
    getByText: (text: string) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent?.includes(text)) {
          return walker.currentNode.parentElement;
        }
      }
      throw new Error(`Text "${text}" not found`);
    },
    queryByRole: (role: string) => container.querySelector(`[role="${role}"], ${role === 'heading' ? 'h1,h2,h3,h4,h5,h6' : ''}`),
    cleanup: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

describe('PageShell', () => {
  it('renders title and description', () => {
    const { getByText, cleanup } = render(
      <PageShell title="BaleyBots" description="Manage your bots">
        <div>Content</div>
      </PageShell>
    );
    expect(getByText('BaleyBots')).toBeTruthy();
    expect(getByText('Manage your bots')).toBeTruthy();
    expect(getByText('Content')).toBeTruthy();
    cleanup();
  });

  it('renders actions in header', () => {
    const { getByText, cleanup } = render(
      <PageShell title="Test" actions={<button>New</button>}>
        <div>Content</div>
      </PageShell>
    );
    expect(getByText('New')).toBeTruthy();
    cleanup();
  });

  it('renders without header when no title/description', () => {
    const { getByText, queryByRole, cleanup } = render(
      <PageShell>
        <div>Content only</div>
      </PageShell>
    );
    expect(getByText('Content only')).toBeTruthy();
    expect(queryByRole('heading')).toBeNull();
    cleanup();
  });

  it('applies constrained container', () => {
    const { container, cleanup } = render(
      <PageShell container="constrained">
        <div>Content</div>
      </PageShell>
    );
    expect(container.querySelector('.max-w-2xl')).toBeTruthy();
    cleanup();
  });

  it('applies standard container by default', () => {
    const { container, cleanup } = render(
      <PageShell title="Test">
        <div>Content</div>
      </PageShell>
    );
    expect(container.querySelector('.container')).toBeTruthy();
    cleanup();
  });
});
