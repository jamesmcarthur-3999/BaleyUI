/**
 * Safe Expression Evaluator
 *
 * Provides secure expression evaluation without using new Function() or eval().
 * This prevents arbitrary code execution vulnerabilities by using a whitelist approach.
 *
 * Supports:
 * - Property access: item.name, data[0], obj['key']
 * - Comparisons: ===, !==, ==, !=, >, <, >=, <=
 * - Logical operators: &&, ||, !
 * - Basic math: +, -, *, /, %
 * - Ternary expressions: condition ? a : b
 * - Literals: strings, numbers, booleans, null, undefined
 *
 * @module safe-eval
 */

/**
 * Forbidden patterns that indicate potentially malicious expressions
 */
const FORBIDDEN_PATTERNS = [
  /\beval\b/,
  /\bFunction\b/,
  /\bimport\b/,
  /\brequire\b/,
  /\bprocess\b/,
  /\bglobal\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bfetch\b/,
  /\b__proto__\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
  /\bObject\.assign\b/,
  /\bObject\.create\b/,
  /\bObject\.defineProperty\b/,
  /\bObject\.setPrototypeOf\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  /\bPromise\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,
  /\bthis\b/,
  /\bself\b/,
  /\barguments\b/,
  /\bmodule\b/,
  /\bexports\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
];

/**
 * Token types for the expression parser
 */
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'IDENTIFIER'
  | 'DOT'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'PLUS'
  | 'MINUS'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'MODULO'
  | 'EQ'
  | 'NEQ'
  | 'STRICT_EQ'
  | 'STRICT_NEQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'TERNARY'
  | 'COLON'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null | undefined;
  raw: string;
}

/**
 * Lexer for tokenizing expressions
 */
class Lexer {
  private pos = 0;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private advance(): string {
    return this.input[this.pos++] || '';
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) {
      this.advance();
    }
  }

  private readNumber(): Token {
    let raw = '';
    while (/[\d.]/.test(this.peek())) {
      raw += this.advance();
    }
    return { type: 'NUMBER', value: parseFloat(raw), raw };
  }

  private readString(quote: string): Token {
    const raw = quote;
    this.advance(); // consume opening quote
    let value = '';
    while (this.peek() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case "'":
            value += "'";
            break;
          case '"':
            value += '"';
            break;
          default:
            value += escaped;
        }
      } else {
        value += this.advance();
      }
    }
    this.advance(); // consume closing quote
    return { type: 'STRING', value, raw: raw + value + quote };
  }

  private readIdentifier(): Token {
    let raw = '';
    while (/[a-zA-Z0-9_$]/.test(this.peek())) {
      raw += this.advance();
    }

    // Check for keywords
    if (raw === 'true') {
      return { type: 'BOOLEAN', value: true, raw };
    }
    if (raw === 'false') {
      return { type: 'BOOLEAN', value: false, raw };
    }
    if (raw === 'null') {
      return { type: 'NULL', value: null, raw };
    }
    if (raw === 'undefined') {
      return { type: 'UNDEFINED', value: undefined, raw };
    }

    return { type: 'IDENTIFIER', value: raw, raw };
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const char = this.peek();

      // Numbers
      if (/\d/.test(char)) {
        tokens.push(this.readNumber());
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
        tokens.push(this.readString(char));
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_$]/.test(char)) {
        tokens.push(this.readIdentifier());
        continue;
      }

      // Operators and punctuation
      switch (char) {
        case '.':
          tokens.push({ type: 'DOT', value: '.', raw: '.' });
          this.advance();
          break;
        case '[':
          tokens.push({ type: 'LBRACKET', value: '[', raw: '[' });
          this.advance();
          break;
        case ']':
          tokens.push({ type: 'RBRACKET', value: ']', raw: ']' });
          this.advance();
          break;
        case '(':
          tokens.push({ type: 'LPAREN', value: '(', raw: '(' });
          this.advance();
          break;
        case ')':
          tokens.push({ type: 'RPAREN', value: ')', raw: ')' });
          this.advance();
          break;
        case ',':
          tokens.push({ type: 'COMMA', value: ',', raw: ',' });
          this.advance();
          break;
        case '+':
          tokens.push({ type: 'PLUS', value: '+', raw: '+' });
          this.advance();
          break;
        case '-':
          tokens.push({ type: 'MINUS', value: '-', raw: '-' });
          this.advance();
          break;
        case '*':
          tokens.push({ type: 'MULTIPLY', value: '*', raw: '*' });
          this.advance();
          break;
        case '/':
          tokens.push({ type: 'DIVIDE', value: '/', raw: '/' });
          this.advance();
          break;
        case '%':
          tokens.push({ type: 'MODULO', value: '%', raw: '%' });
          this.advance();
          break;
        case '?':
          tokens.push({ type: 'TERNARY', value: '?', raw: '?' });
          this.advance();
          break;
        case ':':
          tokens.push({ type: 'COLON', value: ':', raw: ':' });
          this.advance();
          break;
        case '!':
          if (this.input[this.pos + 1] === '=') {
            if (this.input[this.pos + 2] === '=') {
              tokens.push({ type: 'STRICT_NEQ', value: '!==', raw: '!==' });
              this.pos += 3;
            } else {
              tokens.push({ type: 'NEQ', value: '!=', raw: '!=' });
              this.pos += 2;
            }
          } else {
            tokens.push({ type: 'NOT', value: '!', raw: '!' });
            this.advance();
          }
          break;
        case '=':
          if (this.input[this.pos + 1] === '=') {
            if (this.input[this.pos + 2] === '=') {
              tokens.push({ type: 'STRICT_EQ', value: '===', raw: '===' });
              this.pos += 3;
            } else {
              tokens.push({ type: 'EQ', value: '==', raw: '==' });
              this.pos += 2;
            }
          } else {
            throw new Error(`Unexpected character: ${char}`);
          }
          break;
        case '>':
          if (this.input[this.pos + 1] === '=') {
            tokens.push({ type: 'GTE', value: '>=', raw: '>=' });
            this.pos += 2;
          } else {
            tokens.push({ type: 'GT', value: '>', raw: '>' });
            this.advance();
          }
          break;
        case '<':
          if (this.input[this.pos + 1] === '=') {
            tokens.push({ type: 'LTE', value: '<=', raw: '<=' });
            this.pos += 2;
          } else {
            tokens.push({ type: 'LT', value: '<', raw: '<' });
            this.advance();
          }
          break;
        case '&':
          if (this.input[this.pos + 1] === '&') {
            tokens.push({ type: 'AND', value: '&&', raw: '&&' });
            this.pos += 2;
          } else {
            throw new Error(`Unexpected character: ${char}`);
          }
          break;
        case '|':
          if (this.input[this.pos + 1] === '|') {
            tokens.push({ type: 'OR', value: '||', raw: '||' });
            this.pos += 2;
          } else {
            throw new Error(`Unexpected character: ${char}`);
          }
          break;
        default:
          throw new Error(`Unexpected character: ${char}`);
      }
    }

    tokens.push({ type: 'EOF', value: null, raw: '' });
    return tokens;
  }
}

/**
 * AST Node types
 */
type ASTNode =
  | { type: 'Literal'; value: unknown }
  | { type: 'Identifier'; name: string }
  | { type: 'MemberExpression'; object: ASTNode; property: ASTNode; computed: boolean }
  | { type: 'BinaryExpression'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'LogicalExpression'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'UnaryExpression'; operator: string; argument: ASTNode }
  | { type: 'ConditionalExpression'; test: ASTNode; consequent: ASTNode; alternate: ASTNode };

/**
 * Parser for building AST from tokens
 */
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: null, raw: '' };
  }

  private advance(): Token {
    return this.tokens[this.pos++] || { type: 'EOF', value: null, raw: '' };
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(`Expected ${type}, got ${token.type}`);
    }
    return this.advance();
  }

  parse(): ASTNode {
    const result = this.parseExpression();
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().raw}`);
    }
    return result;
  }

  private parseExpression(): ASTNode {
    return this.parseTernary();
  }

  private parseTernary(): ASTNode {
    let node = this.parseOr();

    if (this.current().type === 'TERNARY') {
      this.advance();
      const consequent = this.parseExpression();
      this.expect('COLON');
      const alternate = this.parseExpression();
      node = { type: 'ConditionalExpression', test: node, consequent, alternate };
    }

    return node;
  }

  private parseOr(): ASTNode {
    let node = this.parseAnd();

    while (this.current().type === 'OR') {
      const operator = this.advance().raw as string;
      const right = this.parseAnd();
      node = { type: 'LogicalExpression', operator, left: node, right };
    }

    return node;
  }

  private parseAnd(): ASTNode {
    let node = this.parseEquality();

    while (this.current().type === 'AND') {
      const operator = this.advance().raw as string;
      const right = this.parseEquality();
      node = { type: 'LogicalExpression', operator, left: node, right };
    }

    return node;
  }

  private parseEquality(): ASTNode {
    let node = this.parseComparison();

    while (['EQ', 'NEQ', 'STRICT_EQ', 'STRICT_NEQ'].includes(this.current().type)) {
      const operator = this.advance().raw as string;
      const right = this.parseComparison();
      node = { type: 'BinaryExpression', operator, left: node, right };
    }

    return node;
  }

  private parseComparison(): ASTNode {
    let node = this.parseAdditive();

    while (['GT', 'GTE', 'LT', 'LTE'].includes(this.current().type)) {
      const operator = this.advance().raw as string;
      const right = this.parseAdditive();
      node = { type: 'BinaryExpression', operator, left: node, right };
    }

    return node;
  }

  private parseAdditive(): ASTNode {
    let node = this.parseMultiplicative();

    while (['PLUS', 'MINUS'].includes(this.current().type)) {
      const operator = this.advance().raw as string;
      const right = this.parseMultiplicative();
      node = { type: 'BinaryExpression', operator, left: node, right };
    }

    return node;
  }

  private parseMultiplicative(): ASTNode {
    let node = this.parseUnary();

    while (['MULTIPLY', 'DIVIDE', 'MODULO'].includes(this.current().type)) {
      const operator = this.advance().raw as string;
      const right = this.parseUnary();
      node = { type: 'BinaryExpression', operator, left: node, right };
    }

    return node;
  }

  private parseUnary(): ASTNode {
    if (this.current().type === 'NOT') {
      const operator = this.advance().raw as string;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator, argument };
    }

    if (this.current().type === 'MINUS') {
      const operator = this.advance().raw as string;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator, argument };
    }

    return this.parseMemberExpression();
  }

  private parseMemberExpression(): ASTNode {
    let node = this.parsePrimary();

    while (true) {
      if (this.current().type === 'DOT') {
        this.advance();
        const property = this.current();
        if (property.type !== 'IDENTIFIER') {
          throw new Error(`Expected identifier after '.', got ${property.type}`);
        }
        this.advance();
        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Literal', value: property.value },
          computed: false,
        };
      } else if (this.current().type === 'LBRACKET') {
        this.advance();
        const property = this.parseExpression();
        this.expect('RBRACKET');
        node = {
          type: 'MemberExpression',
          object: node,
          property,
          computed: true,
        };
      } else {
        break;
      }
    }

    return node;
  }

  private parsePrimary(): ASTNode {
    const token = this.current();

    switch (token.type) {
      case 'NUMBER':
      case 'STRING':
      case 'BOOLEAN':
      case 'NULL':
      case 'UNDEFINED':
        this.advance();
        return { type: 'Literal', value: token.value };

      case 'IDENTIFIER':
        this.advance();
        return { type: 'Identifier', name: token.value as string };

      case 'LPAREN':
        this.advance();
        const expr = this.parseExpression();
        this.expect('RPAREN');
        return expr;

      default:
        throw new Error(`Unexpected token: ${token.raw || token.type}`);
    }
  }
}

/**
 * Evaluate an AST node with the given context
 */
function evaluate(node: ASTNode, context: Record<string, unknown>): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier':
      if (!(node.name in context)) {
        return undefined;
      }
      return context[node.name];

    case 'MemberExpression': {
      const object = evaluate(node.object, context);
      if (object === null || object === undefined) {
        return undefined;
      }
      const property = node.computed
        ? evaluate(node.property, context)
        : (node.property as { type: 'Literal'; value: unknown }).value;

      if (typeof property !== 'string' && typeof property !== 'number') {
        return undefined;
      }

      return (object as Record<string | number, unknown>)[property];
    }

    case 'BinaryExpression': {
      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);

      switch (node.operator) {
        case '+':
          return (left as number) + (right as number);
        case '-':
          return (left as number) - (right as number);
        case '*':
          return (left as number) * (right as number);
        case '/':
          return (left as number) / (right as number);
        case '%':
          return (left as number) % (right as number);
        case '==':
          // eslint-disable-next-line eqeqeq
          return left == right;
        case '!=':
          // eslint-disable-next-line eqeqeq
          return left != right;
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '>':
          return (left as number) > (right as number);
        case '>=':
          return (left as number) >= (right as number);
        case '<':
          return (left as number) < (right as number);
        case '<=':
          return (left as number) <= (right as number);
        default:
          throw new Error(`Unknown operator: ${node.operator}`);
      }
    }

    case 'LogicalExpression': {
      const left = evaluate(node.left, context);

      switch (node.operator) {
        case '&&':
          return left ? evaluate(node.right, context) : left;
        case '||':
          return left ? left : evaluate(node.right, context);
        default:
          throw new Error(`Unknown logical operator: ${node.operator}`);
      }
    }

    case 'UnaryExpression': {
      const argument = evaluate(node.argument, context);

      switch (node.operator) {
        case '!':
          return !argument;
        case '-':
          return -(argument as number);
        default:
          throw new Error(`Unknown unary operator: ${node.operator}`);
      }
    }

    case 'ConditionalExpression': {
      const test = evaluate(node.test, context);
      return test ? evaluate(node.consequent, context) : evaluate(node.alternate, context);
    }

    default:
      throw new Error(`Unknown node type: ${(node as ASTNode).type}`);
  }
}

/**
 * Check if an expression is safe to evaluate.
 *
 * Validates the expression against a list of forbidden patterns that could
 * indicate attempts at code injection or prototype pollution.
 *
 * @param expr - The expression string to validate
 * @returns true if the expression appears safe, false otherwise
 *
 * @example
 * ```typescript
 * isSafeExpression('item.name === "test"'); // true
 * isSafeExpression('eval("malicious")'); // false
 * isSafeExpression('obj.__proto__'); // false
 * ```
 */
export function isSafeExpression(expr: string): boolean {
  if (!expr || typeof expr !== 'string') {
    return false;
  }

  // Check against forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(expr)) {
      return false;
    }
  }

  // Try to tokenize and parse to ensure valid syntax
  try {
    const lexer = new Lexer(expr);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    parser.parse();
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely evaluate an expression with the given context.
 *
 * Parses and evaluates the expression using a custom interpreter that only
 * supports safe operations (property access, comparisons, logical operators,
 * basic math, and ternary expressions).
 *
 * @param expr - The expression string to evaluate
 * @param context - An object containing variables accessible in the expression
 * @returns The result of evaluating the expression
 * @throws Error if the expression is unsafe or contains invalid syntax
 *
 * @example
 * ```typescript
 * evaluateSafeExpression('item.name', { item: { name: 'test' } }); // 'test'
 * evaluateSafeExpression('data[0]', { data: [1, 2, 3] }); // 1
 * evaluateSafeExpression('a > b ? a : b', { a: 5, b: 3 }); // 5
 * ```
 */
export function evaluateSafeExpression(
  expr: string,
  context: Record<string, unknown>
): unknown {
  if (!isSafeExpression(expr)) {
    throw new Error(`Unsafe expression: ${expr}`);
  }

  const lexer = new Lexer(expr);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  return evaluate(ast, context);
}

/**
 * Create a reusable condition evaluator function.
 *
 * Pre-parses the condition expression and returns a function that can be
 * called multiple times with different contexts. This is more efficient
 * when the same condition needs to be evaluated repeatedly.
 *
 * @param condition - The condition expression string
 * @returns A function that evaluates the condition with a given context
 * @throws Error if the condition is unsafe or contains invalid syntax
 *
 * @example
 * ```typescript
 * const isActive = createConditionEvaluator('item.status === "active"');
 * isActive({ item: { status: 'active' } }); // true
 * isActive({ item: { status: 'inactive' } }); // false
 * ```
 */
export function createConditionEvaluator(
  condition: string
): (context: Record<string, unknown>) => boolean {
  if (!isSafeExpression(condition)) {
    throw new Error(`Unsafe condition: ${condition}`);
  }

  const lexer = new Lexer(condition);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  return (context: Record<string, unknown>) => {
    const result = evaluate(ast, context);
    return Boolean(result);
  };
}

/**
 * Evaluate a simple field-based condition.
 *
 * A more restricted evaluator that only supports simple field comparisons.
 * Use this when you need to evaluate conditions in the format:
 * `fieldPath operator value`
 *
 * @param field - The field path (e.g., 'item.name' or 'data[0]')
 * @param operator - The comparison operator
 * @param value - The value to compare against
 * @param context - The context containing the data
 * @returns true if the condition is met
 *
 * @example
 * ```typescript
 * evaluateFieldCondition('item.count', '>', 5, { item: { count: 10 } }); // true
 * ```
 */
export function evaluateFieldCondition(
  field: string,
  operator: '===' | '!==' | '==' | '!=' | '>' | '>=' | '<' | '<=',
  value: unknown,
  context: Record<string, unknown>
): boolean {
  const fieldValue = evaluateSafeExpression(field, context);

  switch (operator) {
    case '===':
      return fieldValue === value;
    case '!==':
      return fieldValue !== value;
    case '==':
      // eslint-disable-next-line eqeqeq
      return fieldValue == value;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return fieldValue != value;
    case '>':
      return (fieldValue as number) > (value as number);
    case '>=':
      return (fieldValue as number) >= (value as number);
    case '<':
      return (fieldValue as number) < (value as number);
    case '<=':
      return (fieldValue as number) <= (value as number);
    default:
      return false;
  }
}
