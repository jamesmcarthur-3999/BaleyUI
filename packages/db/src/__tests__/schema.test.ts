import { describe, it, expect } from 'vitest';
import { baleybots } from '../schema';

describe('baleybots schema', () => {
  it('has isInternal column', () => {
    // Access the column definition to verify it exists
    expect(baleybots.isInternal).toBeDefined();
  });
});
