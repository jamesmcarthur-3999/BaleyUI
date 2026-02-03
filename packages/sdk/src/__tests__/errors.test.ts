import { describe, it, expect } from 'vitest';
import {
  BaleyUIError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  ConnectionError,
} from '../errors';

describe('BaleyUIError', () => {
  it('creates error with message', () => {
    const error = new BaleyUIError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('BaleyUIError');
    expect(error instanceof Error).toBe(true);
  });

  it('creates error with all parameters', () => {
    const error = new BaleyUIError('Test error', 500, 'server_error', 'Additional details');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('server_error');
    expect(error.details).toBe('Additional details');
  });

  it('creates error with optional parameters undefined', () => {
    const error = new BaleyUIError('Test error');
    expect(error.statusCode).toBeUndefined();
    expect(error.code).toBeUndefined();
    expect(error.details).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const error = new BaleyUIError('Test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new BaleyUIError('Test');
    expect(Object.getPrototypeOf(error)).toBe(BaleyUIError.prototype);
  });
});

describe('AuthenticationError', () => {
  it('creates error with default message', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Invalid or missing API key');
    expect(error.name).toBe('AuthenticationError');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('authentication_error');
  });

  it('creates error with custom message', () => {
    const error = new AuthenticationError('Custom auth error');
    expect(error.message).toBe('Custom auth error');
  });

  it('extends BaleyUIError', () => {
    const error = new AuthenticationError();
    expect(error instanceof BaleyUIError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new AuthenticationError();
    expect(Object.getPrototypeOf(error)).toBe(AuthenticationError.prototype);
  });
});

describe('PermissionError', () => {
  it('creates error with default message', () => {
    const error = new PermissionError();
    expect(error.message).toBe('Insufficient permissions');
    expect(error.name).toBe('PermissionError');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('permission_error');
  });

  it('creates error with custom message', () => {
    const error = new PermissionError('Access denied to resource');
    expect(error.message).toBe('Access denied to resource');
  });

  it('extends BaleyUIError', () => {
    const error = new PermissionError();
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new PermissionError();
    expect(Object.getPrototypeOf(error)).toBe(PermissionError.prototype);
  });
});

describe('NotFoundError', () => {
  it('creates error with resource and id', () => {
    const error = new NotFoundError('Flow', 'flow-123');
    expect(error.message).toBe('Flow not found: flow-123');
    expect(error.name).toBe('NotFoundError');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('not_found');
  });

  it('extends BaleyUIError', () => {
    const error = new NotFoundError('Block', 'block-456');
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('handles different resource types', () => {
    const flowError = new NotFoundError('Flow', 'flow-1');
    expect(flowError.message).toBe('Flow not found: flow-1');

    const blockError = new NotFoundError('Block', 'block-2');
    expect(blockError.message).toBe('Block not found: block-2');

    const executionError = new NotFoundError('Execution', 'exec-3');
    expect(executionError.message).toBe('Execution not found: exec-3');
  });

  it('has correct prototype chain', () => {
    const error = new NotFoundError('Test', '123');
    expect(Object.getPrototypeOf(error)).toBe(NotFoundError.prototype);
  });
});

describe('ValidationError', () => {
  it('creates error with message only', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('ValidationError');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('validation_error');
    expect(error.details).toBeUndefined();
  });

  it('creates error with message and details', () => {
    const error = new ValidationError('Invalid input', 'Field "name" is required');
    expect(error.message).toBe('Invalid input');
    expect(error.details).toBe('Field "name" is required');
  });

  it('extends BaleyUIError', () => {
    const error = new ValidationError('Invalid');
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new ValidationError('Test');
    expect(Object.getPrototypeOf(error)).toBe(ValidationError.prototype);
  });
});

describe('RateLimitError', () => {
  it('creates error with default message', () => {
    const error = new RateLimitError();
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.name).toBe('RateLimitError');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('rate_limit_error');
    expect(error.retryAfter).toBeUndefined();
  });

  it('creates error with retryAfter', () => {
    const error = new RateLimitError(60);
    expect(error.retryAfter).toBe(60);
  });

  it('extends BaleyUIError', () => {
    const error = new RateLimitError();
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new RateLimitError();
    expect(Object.getPrototypeOf(error)).toBe(RateLimitError.prototype);
  });
});

describe('TimeoutError', () => {
  it('creates error with timeout value', () => {
    const error = new TimeoutError(30000);
    expect(error.message).toBe('Execution timed out after 30000ms');
    expect(error.name).toBe('TimeoutError');
    expect(error.statusCode).toBeUndefined();
    expect(error.code).toBe('timeout_error');
  });

  it('formats timeout value in message', () => {
    const error1 = new TimeoutError(5000);
    expect(error1.message).toBe('Execution timed out after 5000ms');

    const error2 = new TimeoutError(300000);
    expect(error2.message).toBe('Execution timed out after 300000ms');
  });

  it('extends BaleyUIError', () => {
    const error = new TimeoutError(1000);
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new TimeoutError(1000);
    expect(Object.getPrototypeOf(error)).toBe(TimeoutError.prototype);
  });
});

describe('ConnectionError', () => {
  it('creates error with default message', () => {
    const error = new ConnectionError();
    expect(error.message).toBe('Failed to connect to BaleyUI API');
    expect(error.name).toBe('ConnectionError');
    expect(error.statusCode).toBeUndefined();
    expect(error.code).toBe('connection_error');
  });

  it('creates error with custom message', () => {
    const error = new ConnectionError('Network unavailable');
    expect(error.message).toBe('Network unavailable');
  });

  it('extends BaleyUIError', () => {
    const error = new ConnectionError();
    expect(error instanceof BaleyUIError).toBe(true);
  });

  it('has correct prototype chain', () => {
    const error = new ConnectionError();
    expect(Object.getPrototypeOf(error)).toBe(ConnectionError.prototype);
  });
});

describe('Error hierarchy', () => {
  it('all errors are instanceof Error', () => {
    expect(new BaleyUIError('test') instanceof Error).toBe(true);
    expect(new AuthenticationError() instanceof Error).toBe(true);
    expect(new PermissionError() instanceof Error).toBe(true);
    expect(new NotFoundError('r', 'id') instanceof Error).toBe(true);
    expect(new ValidationError('msg') instanceof Error).toBe(true);
    expect(new RateLimitError() instanceof Error).toBe(true);
    expect(new TimeoutError(1000) instanceof Error).toBe(true);
    expect(new ConnectionError() instanceof Error).toBe(true);
  });

  it('all errors are instanceof BaleyUIError', () => {
    expect(new AuthenticationError() instanceof BaleyUIError).toBe(true);
    expect(new PermissionError() instanceof BaleyUIError).toBe(true);
    expect(new NotFoundError('r', 'id') instanceof BaleyUIError).toBe(true);
    expect(new ValidationError('msg') instanceof BaleyUIError).toBe(true);
    expect(new RateLimitError() instanceof BaleyUIError).toBe(true);
    expect(new TimeoutError(1000) instanceof BaleyUIError).toBe(true);
    expect(new ConnectionError() instanceof BaleyUIError).toBe(true);
  });

  it('errors can be caught by their specific type', () => {
    const errors = [
      new AuthenticationError(),
      new PermissionError(),
      new NotFoundError('r', 'id'),
      new ValidationError('msg'),
      new RateLimitError(),
      new TimeoutError(1000),
      new ConnectionError(),
    ];

    for (const error of errors) {
      try {
        throw error;
      } catch (e) {
        expect(e instanceof BaleyUIError).toBe(true);
      }
    }
  });
});
