import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ActionCard, type RecommendationItem } from '../ActionCard';

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

function textContent(): string {
  return container.textContent ?? '';
}

function queryAll(selector: string): HTMLElement[] {
  return Array.from(container.querySelectorAll(selector));
}

afterEach(() => {
  if (root) {
    flushSync(() => root.unmount());
  }
  container?.remove();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecommendation(overrides: Partial<RecommendationItem> = {}): RecommendationItem {
  return {
    id: 'rec-1',
    title: 'Test recommendation',
    description: 'Test description',
    severity: 'info',
    targetType: 'insight',
    proposedAction: null,
    status: 'pending',
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — Header (always visible)
// ---------------------------------------------------------------------------

describe('ActionCard', () => {
  it('renders title text', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ title: 'Fix slow bot' })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Fix slow bot');
  });

  it('renders severity badge for critical', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ severity: 'critical' })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Critical');
  });

  it('renders severity badge for warning', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ severity: 'warning' })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Warning');
  });

  it('renders severity badge for info', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ severity: 'info' })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Info');
  });

  it('shows target bot name when provided', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({
          targetBaleybot: { id: 'bb-1', name: 'research_bot', icon: null },
        })}
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('research_bot');
  });

  it('renders type label for various target types', () => {
    const types = [
      { targetType: 'approval_pattern', label: 'Auto-approval' },
      { targetType: 'bal_patch', label: 'Code fix' },
      { targetType: 'error_review', label: 'Error analysis' },
      { targetType: 'configuration', label: 'Configuration' },
      { targetType: 'insight', label: 'Insight' },
      { targetType: 'performance', label: 'Performance' },
    ];

    for (const { targetType, label } of types) {
      render(
        <ActionCard
          recommendation={makeRecommendation({ targetType })}
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />
      );
      expect(textContent()).toContain(label);
      flushSync(() => root.unmount());
      container.remove();
    }
  });

  // ---------------------------------------------------------------------------
  // Tests — Expanded content (using defaultExpanded)
  // ---------------------------------------------------------------------------

  it('shows type-specific buttons for approval_pattern when expanded', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'approval_pattern' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const text = textContent();
    expect(text).toContain('Accept Rule');
    expect(text).toContain('Skip');
  });

  it('shows type-specific buttons for bal_patch when expanded', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'bal_patch' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const text = textContent();
    expect(text).toContain('Apply Fix');
    expect(text).toContain('Skip');
  });

  it('shows "Got it" for insight type (no primary button)', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'insight' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const text = textContent();
    expect(text).toContain('Got it');
    expect(text).not.toContain('Accept');
    expect(text).not.toContain('Apply');
  });

  it('shows resolved badge when status is accepted', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ status: 'accepted' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Accepted');
    expect(textContent()).not.toContain('Got it');
  });

  it('shows dismissed badge when status is dismissed', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ status: 'dismissed' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Dismissed');
  });

  it('renders description when expanded', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ description: 'Detailed explanation here' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(textContent()).toContain('Detailed explanation here');
  });

  it('renders approval_pattern proposed action details', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({
          targetType: 'approval_pattern',
          proposedAction: { tool: 'web_search', entityGoalPattern: 'research' },
          targetBaleybot: { id: 'bb-1', name: 'my_bot', icon: null },
        })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const text = textContent();
    expect(text).toContain('web_search');
    expect(text).toContain('my_bot');
  });

  it('renders bal_patch code blocks when expanded', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({
          targetType: 'bal_patch',
          proposedAction: {
            currentCode: 'old code here',
            proposedCode: 'new code here',
          },
        })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const pres = queryAll('pre');
    expect(pres.length).toBe(2);
    expect(pres[0]!.textContent).toContain('old code here');
    expect(pres[1]!.textContent).toContain('new code here');
  });

  it('disables buttons when isPending is true', () => {
    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'approval_pattern' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={vi.fn()}
        isPending
      />
    );

    const buttons = queryAll('button');
    const actionButtons = buttons.filter(
      (b) => b.textContent?.includes('Accept Rule') || b.textContent?.includes('Skip')
    );
    for (const btn of actionButtons) {
      expect(btn.hasAttribute('disabled')).toBe(true);
    }
  });

  it('calls onAccept when primary button is clicked', async () => {
    const onAccept = vi.fn();
    vi.useFakeTimers();

    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'approval_pattern', id: 'rec-42' })}
        defaultExpanded
        onAccept={onAccept}
        onDismiss={vi.fn()}
      />
    );

    const buttons = queryAll('button');
    const acceptBtn = buttons.find((b) => b.textContent?.includes('Accept Rule'));
    acceptBtn?.click();

    // onAccept fires after 200ms timeout (removal animation)
    vi.advanceTimersByTime(250);
    expect(onAccept).toHaveBeenCalledWith('rec-42');
    vi.useRealTimers();
  });

  it('calls onDismiss when secondary button is clicked', async () => {
    const onDismiss = vi.fn();
    vi.useFakeTimers();

    render(
      <ActionCard
        recommendation={makeRecommendation({ targetType: 'approval_pattern', id: 'rec-42' })}
        defaultExpanded
        onAccept={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const buttons = queryAll('button');
    const skipBtn = buttons.find((b) => b.textContent?.includes('Skip'));
    skipBtn?.click();

    vi.advanceTimersByTime(250);
    expect(onDismiss).toHaveBeenCalledWith('rec-42');
    vi.useRealTimers();
  });
});
