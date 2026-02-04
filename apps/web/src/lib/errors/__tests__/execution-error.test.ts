/**
 * Execution Error Tests
 *
 * Tests for structured execution errors with codes, context, and recovery hints.
 */

import { describe, it, expect } from 'vitest';
import { ExecutionError, ErrorCode } from '../execution-error';

describe('ExecutionError', () => {
  describe('construction', () => {
    it('should preserve error context', () => {
      const cause = new Error('Database connection failed');
      const error = new ExecutionError({
        code: ErrorCode.TOOL_EXECUTION_FAILED,
        message: 'Failed to execute database_query tool',
        context: {
          toolName: 'database_query',
          baleybotId: 'bb-123',
          executionId: 'exec-456',
        },
        cause,
      });

      expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
      expect(error.context.toolName).toBe('database_query');
      expect(error.context.baleybotId).toBe('bb-123');
      expect(error.cause).toBe(cause);
      expect(error.message).toBe('Failed to execute database_query tool');
    });

    it('should default context to empty object', () => {
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_FAILED,
        message: 'Generic failure',
      });

      expect(error.context).toEqual({});
    });

    it('should capture timestamp', () => {
      const before = new Date();
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_TIMEOUT,
        message: 'Timeout',
      });
      const after = new Date();

      expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('recovery hints', () => {
    it('should provide recovery hints', () => {
      const error = new ExecutionError({
        code: ErrorCode.APPROVAL_TIMEOUT,
        message: 'Tool approval request timed out',
        recoveryHint: 'Check the Approvals page to manually approve pending requests.',
      });

      expect(error.recoveryHint).toContain('Approvals page');
    });

    it('should include recovery hint in user message', () => {
      const error = new ExecutionError({
        code: ErrorCode.RATE_LIMITED,
        message: 'Rate limit exceeded',
        recoveryHint: 'Wait 60 seconds before retrying.',
      });

      const userMessage = error.toUserMessage();
      expect(userMessage).toContain('Rate limit exceeded');
      expect(userMessage).toContain('Wait 60 seconds');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const error = new ExecutionError({
        code: ErrorCode.TOOL_EXECUTION_FAILED,
        message: 'Failed to execute database_query tool',
        context: {
          toolName: 'database_query',
          baleybotId: 'bb-123',
        },
        recoveryHint: 'Check database connection.',
      });

      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'ExecutionError',
        code: 'TOOL_EXECUTION_FAILED',
        message: 'Failed to execute database_query tool',
        context: { toolName: 'database_query' },
        recoveryHint: 'Check database connection.',
      });
      expect(json.timestamp).toBeDefined();
    });

    it('should include cause message if present', () => {
      const cause = new Error('Connection refused');
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_FAILED,
        message: 'Execution failed',
        cause,
      });

      const json = error.toJSON();
      expect(json.cause).toBe('Connection refused');
    });
  });

  describe('error codes', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCode.EXECUTION_FAILED).toBe('EXECUTION_FAILED');
      expect(ErrorCode.EXECUTION_TIMEOUT).toBe('EXECUTION_TIMEOUT');
      expect(ErrorCode.EXECUTION_CANCELLED).toBe('EXECUTION_CANCELLED');
      expect(ErrorCode.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
      expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe('TOOL_EXECUTION_FAILED');
      expect(ErrorCode.TOOL_FORBIDDEN).toBe('TOOL_FORBIDDEN');
      expect(ErrorCode.APPROVAL_REQUIRED).toBe('APPROVAL_REQUIRED');
      expect(ErrorCode.APPROVAL_DENIED).toBe('APPROVAL_DENIED');
      expect(ErrorCode.APPROVAL_TIMEOUT).toBe('APPROVAL_TIMEOUT');
      expect(ErrorCode.POLICY_VIOLATION).toBe('POLICY_VIOLATION');
      expect(ErrorCode.SPAWN_DEPTH_EXCEEDED).toBe('SPAWN_DEPTH_EXCEEDED');
      expect(ErrorCode.RESOURCE_EXHAUSTED).toBe('RESOURCE_EXHAUSTED');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    });
  });

  describe('instanceof', () => {
    it('should be instanceof Error', () => {
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_FAILED,
        message: 'Test',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExecutionError);
    });

    it('should have correct name', () => {
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_FAILED,
        message: 'Test',
      });

      expect(error.name).toBe('ExecutionError');
    });
  });

  describe('toUserMessage', () => {
    it('should return just message when no recovery hint', () => {
      const error = new ExecutionError({
        code: ErrorCode.EXECUTION_FAILED,
        message: 'Something went wrong',
      });

      expect(error.toUserMessage()).toBe('Something went wrong');
    });

    it('should append recovery hint when present', () => {
      const error = new ExecutionError({
        code: ErrorCode.TOOL_FORBIDDEN,
        message: 'Tool "database_query" is not allowed',
        recoveryHint: 'Contact workspace admin to enable this tool.',
      });

      const msg = error.toUserMessage();
      expect(msg).toContain('Tool "database_query" is not allowed');
      expect(msg).toContain('Suggestion:');
      expect(msg).toContain('Contact workspace admin');
    });
  });
});
