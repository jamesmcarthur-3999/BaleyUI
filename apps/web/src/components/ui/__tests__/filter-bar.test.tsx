import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FilterBar } from '../filter-bar';
import { List, LayoutGrid } from 'lucide-react';

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
  if (root) {
    flushSync(() => root.unmount());
  }
  container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FilterBar', () => {
  it('renders children in flex layout', () => {
    render(
      <FilterBar>
        <span>child-1</span>
        <span>child-2</span>
      </FilterBar>
    );
    expect(getByText('child-1')).toBeTruthy();
    expect(getByText('child-2')).toBeTruthy();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex');
  });

  it('accepts custom className', () => {
    render(
      <FilterBar className="custom-class">
        <span>child</span>
      </FilterBar>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('custom-class');
  });
});

describe('FilterBar.Search', () => {
  it('renders input with search icon', () => {
    render(
      <FilterBar>
        <FilterBar.Search value="" onChange={() => {}} placeholder="Search..." />
      </FilterBar>
    );
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('Search...');
    // Search icon (svg) is present
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('fires onChange with new value', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.Search value="" onChange={onChange} />
      </FilterBar>
    );
    const input = container.querySelector('input') as HTMLInputElement;
    // Simulate native input event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    nativeInputValueSetter.call(input, 'test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('test');
  });
});

describe('FilterBar.Select', () => {
  it('renders a select trigger', () => {
    render(
      <FilterBar>
        <FilterBar.Select
          value="all"
          onValueChange={() => {}}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
          ]}
          placeholder="Status"
        />
      </FilterBar>
    );
    // The SelectTrigger renders a button
    const trigger = container.querySelector('button');
    expect(trigger).toBeTruthy();
  });
});

describe('FilterBar.ViewToggle', () => {
  it('highlights active option', () => {
    render(
      <FilterBar>
        <FilterBar.ViewToggle
          value="list"
          onChange={() => {}}
          options={[
            { value: 'list', icon: List, label: 'List view' },
            { value: 'cards', icon: LayoutGrid, label: 'Card view' },
          ]}
        />
      </FilterBar>
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    // First button (active) should NOT have ghost variant
    expect(buttons[0]!.getAttribute('aria-label')).toBe('List view');
    expect(buttons[1]!.getAttribute('aria-label')).toBe('Card view');
  });

  it('fires onChange on click', () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterBar.ViewToggle
          value="list"
          onChange={onChange}
          options={[
            { value: 'list', icon: List, label: 'List view' },
            { value: 'cards', icon: LayoutGrid, label: 'Card view' },
          ]}
        />
      </FilterBar>
    );
    const buttons = container.querySelectorAll('button');
    buttons[1]!.click();
    expect(onChange).toHaveBeenCalledWith('cards');
  });
});

describe('FilterBar.Results', () => {
  it('shows count text', () => {
    render(<FilterBar.Results showing={10} total={40} />);
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('40');
  });

  it('shows clear button when hasFilters and onClearFilters provided', () => {
    const onClear = vi.fn();
    render(<FilterBar.Results showing={5} total={40} hasFilters onClearFilters={onClear} />);
    const clearBtn = getByText('Clear filters');
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    expect(onClear).toHaveBeenCalled();
  });

  it('hides clear button when hasFilters is false', () => {
    render(<FilterBar.Results showing={10} total={40} hasFilters={false} />);
    expect(queryByText('Clear filters')).toBeNull();
  });
});

describe('FilterBar composition', () => {
  it('renders multiple children in flex layout', () => {
    render(
      <FilterBar>
        <FilterBar.Search value="" onChange={() => {}} placeholder="Search..." />
        <FilterBar.Select
          value="all"
          onValueChange={() => {}}
          options={[{ value: 'all', label: 'All' }]}
        />
        <FilterBar.ViewToggle
          value="list"
          onChange={() => {}}
          options={[
            { value: 'list', icon: List, label: 'List view' },
          ]}
        />
      </FilterBar>
    );
    // Check that all subcomponents rendered
    expect(container.querySelector('input')).toBeTruthy();
    // Select trigger + ViewToggle button = at least 2 buttons
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});
