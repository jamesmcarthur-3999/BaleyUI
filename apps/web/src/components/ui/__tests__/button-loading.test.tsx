import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button } from '../button';

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

afterEach(() => {
  if (root) {
    flushSync(() => root.unmount());
  }
  container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Button loading prop', () => {
  it('shows Loader2 spinner when loading={true}', () => {
    render(<Button loading>Submit</Button>);
    const svg = container.querySelector('svg.animate-spin');
    expect(svg).toBeTruthy();
  });

  it('hides spinner when loading={false}', () => {
    render(<Button loading={false}>Submit</Button>);
    const svg = container.querySelector('svg.animate-spin');
    expect(svg).toBeNull();
  });

  it('auto-disables when loading', () => {
    render(<Button loading>Submit</Button>);
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
  });

  it('shows loadingText when provided', () => {
    render(
      <Button loading loadingText="Saving...">
        Save
      </Button>
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('Saving...');
    expect(button.textContent).not.toContain('Save');
  });

  it('falls back to children when no loadingText', () => {
    render(<Button loading>Submit</Button>);
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('Submit');
  });

  it('sets aria-busy="true" when loading', () => {
    render(<Button loading>Submit</Button>);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('does not set aria-busy when not loading', () => {
    render(<Button>Submit</Button>);
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-busy')).toBeNull();
  });

  it('works with variant="outline"', () => {
    render(
      <Button variant="outline" loading>
        Outline
      </Button>
    );
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
    expect(button.querySelector('svg.animate-spin')).toBeTruthy();
  });

  it('works with size="icon"', () => {
    render(
      <Button size="icon" loading>
        X
      </Button>
    );
    const button = container.querySelector('button')!;
    expect(button.disabled).toBe(true);
  });

  it('ignores loading in asChild mode', () => {
    render(
      <Button asChild loading>
        <a href="/test">Link</a>
      </Button>
    );
    // In asChild mode, the Slot renders the child element - loading is ignored
    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    // No spinner injected
    const svg = container.querySelector('svg.animate-spin');
    expect(svg).toBeNull();
  });
});
