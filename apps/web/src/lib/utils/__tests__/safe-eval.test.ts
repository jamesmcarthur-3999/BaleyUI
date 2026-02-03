import { describe, it, expect } from 'vitest';
import {
  isSafeExpression,
  evaluateSafeExpression,
  createConditionEvaluator,
  evaluateFieldCondition,
} from '../safe-eval';

describe('isSafeExpression', () => {
  describe('rejects unsafe expressions', () => {
    it('rejects eval', () => {
      expect(isSafeExpression('eval("code")')).toBe(false);
      // 'someEval' is allowed since it's a different identifier (word boundaries)
      // Only the exact 'eval' keyword is blocked
    });

    it('rejects Function constructor', () => {
      expect(isSafeExpression('new Function("return 1")')).toBe(false);
      expect(isSafeExpression('Function("code")')).toBe(false);
    });

    it('rejects __proto__', () => {
      expect(isSafeExpression('obj.__proto__')).toBe(false);
      expect(isSafeExpression('item.__proto__.polluted')).toBe(false);
    });

    it('rejects constructor access', () => {
      expect(isSafeExpression('obj.constructor')).toBe(false);
      expect(isSafeExpression('[].constructor')).toBe(false);
    });

    it('rejects prototype access', () => {
      expect(isSafeExpression('Object.prototype')).toBe(false);
      expect(isSafeExpression('Array.prototype.push')).toBe(false);
    });

    it('rejects import/require', () => {
      expect(isSafeExpression('import("fs")')).toBe(false);
      expect(isSafeExpression('require("fs")')).toBe(false);
    });

    it('rejects process/global access', () => {
      expect(isSafeExpression('process.env')).toBe(false);
      expect(isSafeExpression('global.something')).toBe(false);
    });

    it('rejects window/document access', () => {
      expect(isSafeExpression('window.location')).toBe(false);
      expect(isSafeExpression('document.cookie')).toBe(false);
    });

    it('rejects fetch', () => {
      expect(isSafeExpression('fetch("http://evil.com")')).toBe(false);
    });

    it('rejects this/self', () => {
      expect(isSafeExpression('this.secret')).toBe(false);
      expect(isSafeExpression('self.postMessage')).toBe(false);
    });

    it('rejects setTimeout/setInterval', () => {
      expect(isSafeExpression('setTimeout(fn, 100)')).toBe(false);
      expect(isSafeExpression('setInterval(fn, 100)')).toBe(false);
    });

    it('rejects empty or invalid expressions', () => {
      expect(isSafeExpression('')).toBe(false);
      expect(isSafeExpression(null as unknown as string)).toBe(false);
      expect(isSafeExpression(undefined as unknown as string)).toBe(false);
    });
  });

  describe('allows safe expressions', () => {
    it('allows property access', () => {
      expect(isSafeExpression('item.name')).toBe(true);
      expect(isSafeExpression('data.user.profile.name')).toBe(true);
    });

    it('allows array access', () => {
      expect(isSafeExpression('data[0]')).toBe(true);
      expect(isSafeExpression('items[index]')).toBe(true);
      expect(isSafeExpression('matrix[0][1]')).toBe(true);
    });

    it('allows bracket notation property access', () => {
      expect(isSafeExpression("obj['key']")).toBe(true);
      expect(isSafeExpression('obj["key"]')).toBe(true);
    });

    it('allows comparisons', () => {
      expect(isSafeExpression('a === b')).toBe(true);
      expect(isSafeExpression('a !== b')).toBe(true);
      expect(isSafeExpression('a == b')).toBe(true);
      expect(isSafeExpression('a != b')).toBe(true);
      expect(isSafeExpression('a > b')).toBe(true);
      expect(isSafeExpression('a >= b')).toBe(true);
      expect(isSafeExpression('a < b')).toBe(true);
      expect(isSafeExpression('a <= b')).toBe(true);
    });

    it('allows logical operators', () => {
      expect(isSafeExpression('a && b')).toBe(true);
      expect(isSafeExpression('a || b')).toBe(true);
      expect(isSafeExpression('!a')).toBe(true);
      expect(isSafeExpression('a && b || c')).toBe(true);
    });

    it('allows math operators', () => {
      expect(isSafeExpression('a + b')).toBe(true);
      expect(isSafeExpression('a - b')).toBe(true);
      expect(isSafeExpression('a * b')).toBe(true);
      expect(isSafeExpression('a / b')).toBe(true);
      expect(isSafeExpression('a % b')).toBe(true);
    });

    it('allows ternary expressions', () => {
      expect(isSafeExpression('a ? b : c')).toBe(true);
      expect(isSafeExpression('x > 0 ? "positive" : "non-positive"')).toBe(true);
    });

    it('allows literals', () => {
      expect(isSafeExpression('42')).toBe(true);
      expect(isSafeExpression('"hello"')).toBe(true);
      expect(isSafeExpression("'world'")).toBe(true);
      expect(isSafeExpression('true')).toBe(true);
      expect(isSafeExpression('false')).toBe(true);
      expect(isSafeExpression('null')).toBe(true);
      expect(isSafeExpression('undefined')).toBe(true);
    });

    it('allows complex safe expressions', () => {
      expect(isSafeExpression('item.status === "active" && item.count > 0')).toBe(true);
      expect(isSafeExpression('data[0].name || data[1].name')).toBe(true);
      expect(isSafeExpression('(a + b) * c')).toBe(true);
    });
  });
});

describe('evaluateSafeExpression', () => {
  describe('handles property access', () => {
    it('evaluates simple property access', () => {
      expect(evaluateSafeExpression('item.name', { item: { name: 'test' } })).toBe('test');
    });

    it('evaluates nested property access', () => {
      const context = { user: { profile: { email: 'test@example.com' } } };
      expect(evaluateSafeExpression('user.profile.email', context)).toBe('test@example.com');
    });

    it('returns undefined for missing properties', () => {
      expect(evaluateSafeExpression('item.missing', { item: {} })).toBeUndefined();
    });

    it('returns undefined for null/undefined objects', () => {
      expect(evaluateSafeExpression('item.name', { item: null })).toBeUndefined();
      expect(evaluateSafeExpression('item.name', { item: undefined })).toBeUndefined();
    });
  });

  describe('handles array access', () => {
    it('evaluates array index access', () => {
      expect(evaluateSafeExpression('data[0]', { data: [1, 2, 3] })).toBe(1);
      expect(evaluateSafeExpression('data[2]', { data: [1, 2, 3] })).toBe(3);
    });

    it('evaluates dynamic index access', () => {
      expect(evaluateSafeExpression('data[index]', { data: [10, 20, 30], index: 1 })).toBe(20);
    });

    it('returns undefined for out-of-bounds access', () => {
      expect(evaluateSafeExpression('data[10]', { data: [1, 2, 3] })).toBeUndefined();
    });
  });

  describe('handles comparisons', () => {
    it('evaluates strict equality', () => {
      expect(evaluateSafeExpression('a === b', { a: 1, b: 1 })).toBe(true);
      expect(evaluateSafeExpression('a === b', { a: 1, b: '1' })).toBe(false);
    });

    it('evaluates strict inequality', () => {
      expect(evaluateSafeExpression('a !== b', { a: 1, b: 2 })).toBe(true);
      expect(evaluateSafeExpression('a !== b', { a: 1, b: 1 })).toBe(false);
    });

    it('evaluates loose equality', () => {
      expect(evaluateSafeExpression('a == b', { a: 1, b: '1' })).toBe(true);
    });

    it('evaluates numeric comparisons', () => {
      expect(evaluateSafeExpression('a > b', { a: 5, b: 3 })).toBe(true);
      expect(evaluateSafeExpression('a >= b', { a: 5, b: 5 })).toBe(true);
      expect(evaluateSafeExpression('a < b', { a: 3, b: 5 })).toBe(true);
      expect(evaluateSafeExpression('a <= b', { a: 5, b: 5 })).toBe(true);
    });
  });

  describe('handles logical operators', () => {
    it('evaluates AND', () => {
      expect(evaluateSafeExpression('a && b', { a: true, b: true })).toBe(true);
      expect(evaluateSafeExpression('a && b', { a: true, b: false })).toBe(false);
      expect(evaluateSafeExpression('a && b', { a: false, b: true })).toBe(false);
    });

    it('evaluates OR', () => {
      expect(evaluateSafeExpression('a || b', { a: false, b: true })).toBe(true);
      expect(evaluateSafeExpression('a || b', { a: false, b: false })).toBe(false);
    });

    it('evaluates NOT', () => {
      expect(evaluateSafeExpression('!a', { a: true })).toBe(false);
      expect(evaluateSafeExpression('!a', { a: false })).toBe(true);
    });

    it('handles short-circuit evaluation', () => {
      expect(evaluateSafeExpression('false && error', { error: 'should not be accessed' })).toBe(false);
      expect(evaluateSafeExpression('true || error', { error: 'should not be accessed' })).toBe(true);
    });
  });

  describe('handles math operators', () => {
    it('evaluates addition', () => {
      expect(evaluateSafeExpression('a + b', { a: 2, b: 3 })).toBe(5);
    });

    it('evaluates subtraction', () => {
      expect(evaluateSafeExpression('a - b', { a: 5, b: 3 })).toBe(2);
    });

    it('evaluates multiplication', () => {
      expect(evaluateSafeExpression('a * b', { a: 4, b: 3 })).toBe(12);
    });

    it('evaluates division', () => {
      expect(evaluateSafeExpression('a / b', { a: 10, b: 2 })).toBe(5);
    });

    it('evaluates modulo', () => {
      expect(evaluateSafeExpression('a % b', { a: 10, b: 3 })).toBe(1);
    });

    it('evaluates unary minus', () => {
      expect(evaluateSafeExpression('-a', { a: 5 })).toBe(-5);
    });
  });

  describe('handles ternary expressions', () => {
    it('evaluates truthy condition', () => {
      expect(evaluateSafeExpression('cond ? a : b', { cond: true, a: 'yes', b: 'no' })).toBe('yes');
    });

    it('evaluates falsy condition', () => {
      expect(evaluateSafeExpression('cond ? a : b', { cond: false, a: 'yes', b: 'no' })).toBe('no');
    });

    it('evaluates complex ternary', () => {
      expect(evaluateSafeExpression('x > 0 ? "positive" : "non-positive"', { x: 5 })).toBe('positive');
      expect(evaluateSafeExpression('x > 0 ? "positive" : "non-positive"', { x: -5 })).toBe('non-positive');
    });
  });

  describe('handles literals', () => {
    it('evaluates number literals', () => {
      expect(evaluateSafeExpression('42', {})).toBe(42);
      expect(evaluateSafeExpression('3.14', {})).toBe(3.14);
    });

    it('evaluates string literals', () => {
      expect(evaluateSafeExpression('"hello"', {})).toBe('hello');
      expect(evaluateSafeExpression("'world'", {})).toBe('world');
    });

    it('evaluates boolean literals', () => {
      expect(evaluateSafeExpression('true', {})).toBe(true);
      expect(evaluateSafeExpression('false', {})).toBe(false);
    });

    it('evaluates null and undefined', () => {
      expect(evaluateSafeExpression('null', {})).toBe(null);
      expect(evaluateSafeExpression('undefined', {})).toBe(undefined);
    });
  });

  describe('throws on unsafe expressions', () => {
    it('throws on eval', () => {
      expect(() => evaluateSafeExpression('eval("1+1")', {})).toThrow('Unsafe expression');
    });

    it('throws on Function', () => {
      expect(() => evaluateSafeExpression('Function("return 1")', {})).toThrow('Unsafe expression');
    });

    it('throws on __proto__', () => {
      expect(() => evaluateSafeExpression('obj.__proto__', { obj: {} })).toThrow('Unsafe expression');
    });

    it('throws on constructor', () => {
      expect(() => evaluateSafeExpression('obj.constructor', { obj: {} })).toThrow('Unsafe expression');
    });
  });

  describe('handles complex expressions', () => {
    it('evaluates complex nested expression', () => {
      const context = {
        user: { age: 25, status: 'active' },
        minAge: 18,
      };
      const result = evaluateSafeExpression(
        'user.age >= minAge && user.status === "active"',
        context
      );
      expect(result).toBe(true);
    });

    it('evaluates expression with multiple operators', () => {
      const result = evaluateSafeExpression('(a + b) * c - d', { a: 2, b: 3, c: 4, d: 5 });
      expect(result).toBe(15); // (2 + 3) * 4 - 5 = 15
    });
  });
});

describe('createConditionEvaluator', () => {
  it('creates a reusable evaluator', () => {
    const isActive = createConditionEvaluator('item.status === "active"');

    expect(isActive({ item: { status: 'active' } })).toBe(true);
    expect(isActive({ item: { status: 'inactive' } })).toBe(false);
    expect(isActive({ item: { status: 'pending' } })).toBe(false);
  });

  it('handles numeric comparisons', () => {
    const isAdult = createConditionEvaluator('age >= 18');

    expect(isAdult({ age: 25 })).toBe(true);
    expect(isAdult({ age: 18 })).toBe(true);
    expect(isAdult({ age: 17 })).toBe(false);
  });

  it('handles complex conditions', () => {
    const isEligible = createConditionEvaluator('age >= 18 && status === "active"');

    expect(isEligible({ age: 25, status: 'active' })).toBe(true);
    expect(isEligible({ age: 25, status: 'inactive' })).toBe(false);
    expect(isEligible({ age: 17, status: 'active' })).toBe(false);
  });

  it('throws on unsafe conditions', () => {
    expect(() => createConditionEvaluator('eval("true")')).toThrow('Unsafe condition');
  });

  it('converts result to boolean', () => {
    const hasValue = createConditionEvaluator('value');

    expect(hasValue({ value: 'something' })).toBe(true);
    expect(hasValue({ value: '' })).toBe(false);
    expect(hasValue({ value: 0 })).toBe(false);
    expect(hasValue({ value: 1 })).toBe(true);
  });
});

describe('evaluateFieldCondition', () => {
  const context = { item: { count: 10, name: 'test', active: true } };

  it('evaluates strict equality', () => {
    expect(evaluateFieldCondition('item.count', '===', 10, context)).toBe(true);
    expect(evaluateFieldCondition('item.count', '===', '10', context)).toBe(false);
    expect(evaluateFieldCondition('item.name', '===', 'test', context)).toBe(true);
  });

  it('evaluates strict inequality', () => {
    expect(evaluateFieldCondition('item.count', '!==', 5, context)).toBe(true);
    expect(evaluateFieldCondition('item.count', '!==', 10, context)).toBe(false);
  });

  it('evaluates loose equality', () => {
    expect(evaluateFieldCondition('item.count', '==', '10', context)).toBe(true);
  });

  it('evaluates numeric comparisons', () => {
    expect(evaluateFieldCondition('item.count', '>', 5, context)).toBe(true);
    expect(evaluateFieldCondition('item.count', '>', 15, context)).toBe(false);
    expect(evaluateFieldCondition('item.count', '>=', 10, context)).toBe(true);
    expect(evaluateFieldCondition('item.count', '<', 15, context)).toBe(true);
    expect(evaluateFieldCondition('item.count', '<=', 10, context)).toBe(true);
  });
});
