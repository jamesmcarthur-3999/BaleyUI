import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FormFieldGroup } from '../form-field-group';

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

afterEach(() => {
  if (root) {
    flushSync(() => root.unmount());
  }
  container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FormFieldGroup', () => {
  it('renders label and children', () => {
    render(
      <FormFieldGroup label="Email">
        <input type="email" />
      </FormFieldGroup>
    );
    // Label is rendered
    const label = container.querySelector('label');
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain('Email');
    // Input is rendered
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    // Label htmlFor matches input id
    expect(label!.htmlFor).toBe(input!.id);
  });

  it('shows required asterisk when required={true}', () => {
    render(
      <FormFieldGroup label="Name" required>
        <input />
      </FormFieldGroup>
    );
    const label = container.querySelector('label');
    expect(label!.textContent).toContain('*');
    // The asterisk should be in a span with text-destructive
    const asterisk = label!.querySelector('span');
    expect(asterisk).toBeTruthy();
    expect(asterisk!.className).toContain('text-destructive');
  });

  it('renders description with correct styling', () => {
    render(
      <FormFieldGroup label="Bio" description="Tell us about yourself">
        <textarea />
      </FormFieldGroup>
    );
    const desc = getByText('Tell us about yourself');
    expect(desc.className).toContain('text-muted-foreground');
    expect(desc.className).toContain('text-sm');
  });

  it('renders error with destructive styling', () => {
    render(
      <FormFieldGroup label="Name" error="Name is required">
        <input />
      </FormFieldGroup>
    );
    const err = getByText('Name is required');
    expect(err.className).toContain('text-destructive');
    expect(err.className).toContain('font-medium');
  });

  it('sets aria-describedby on child', () => {
    render(
      <FormFieldGroup label="Name" description="Your full name">
        <input />
      </FormFieldGroup>
    );
    const input = container.querySelector('input')!;
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // The referenced element should exist
    const descEl = document.getElementById(describedBy!.split(' ')[0]!);
    expect(descEl).toBeTruthy();
    expect(descEl!.textContent).toBe('Your full name');
  });

  it('sets aria-invalid when error present', () => {
    render(
      <FormFieldGroup label="Email" error="Invalid email">
        <input />
      </FormFieldGroup>
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('vertical layout uses space-y-2', () => {
    render(
      <FormFieldGroup label="Name">
        <input />
      </FormFieldGroup>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('space-y-2');
  });

  it('horizontal layout uses flex justify-between', () => {
    render(
      <FormFieldGroup label="Notifications" layout="horizontal">
        <input type="checkbox" />
      </FormFieldGroup>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
    expect(wrapper.className).toContain('justify-between');
  });
});
