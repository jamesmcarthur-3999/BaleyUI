/**
 * FlowRunner Component
 *
 * Embeddable component for executing BaleyUI flows.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useFlowRunner } from '../hooks';
import type { FlowRunnerProps, ThemeConfig } from '../types';

// ============================================================================
// Styles
// ============================================================================

function getStyles(theme: ThemeConfig = {}) {
  const mode = theme.mode || 'light';
  const primaryColor = theme.primaryColor || '#6366f1';
  const borderRadius = {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
  }[theme.borderRadius || 'md'];
  const fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';

  const isDark = mode === 'dark';
  const bgColor = isDark ? '#1f2937' : '#ffffff';
  const textColor = isDark ? '#f9fafb' : '#111827';
  const borderColor = isDark ? '#374151' : '#e5e7eb';
  const mutedColor = isDark ? '#9ca3af' : '#6b7280';

  return {
    container: {
      fontFamily,
      backgroundColor: bgColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius,
      padding: '16px',
    } as React.CSSProperties,
    form: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    } as React.CSSProperties,
    label: {
      fontSize: '14px',
      fontWeight: 500,
      marginBottom: '4px',
      display: 'block',
    } as React.CSSProperties,
    textarea: {
      width: '100%',
      minHeight: '100px',
      padding: '8px 12px',
      fontSize: '14px',
      fontFamily: 'monospace',
      backgroundColor: isDark ? '#111827' : '#f9fafb',
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius,
      resize: 'vertical' as const,
      outline: 'none',
    } as React.CSSProperties,
    button: {
      padding: '10px 16px',
      fontSize: '14px',
      fontWeight: 500,
      color: '#ffffff',
      backgroundColor: primaryColor,
      border: 'none',
      borderRadius,
      cursor: 'pointer',
      transition: 'opacity 0.2s',
    } as React.CSSProperties,
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    } as React.CSSProperties,
    progress: {
      marginTop: '16px',
      padding: '12px',
      backgroundColor: isDark ? '#111827' : '#f9fafb',
      borderRadius,
    } as React.CSSProperties,
    progressHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
    } as React.CSSProperties,
    spinner: {
      width: '16px',
      height: '16px',
      border: '2px solid transparent',
      borderTopColor: primaryColor,
      borderRadius: '50%',
      animation: 'baleyui-spin 1s linear infinite',
    } as React.CSSProperties,
    eventList: {
      fontSize: '12px',
      fontFamily: 'monospace',
      maxHeight: '200px',
      overflowY: 'auto' as const,
    } as React.CSSProperties,
    event: {
      padding: '4px 0',
      borderBottom: `1px solid ${borderColor}`,
    } as React.CSSProperties,
    output: {
      marginTop: '16px',
      padding: '12px',
      backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
      borderRadius,
      border: `1px solid ${isDark ? '#047857' : '#a7f3d0'}`,
    } as React.CSSProperties,
    outputTitle: {
      fontSize: '12px',
      fontWeight: 600,
      color: isDark ? '#6ee7b7' : '#047857',
      marginBottom: '8px',
    } as React.CSSProperties,
    outputContent: {
      fontSize: '14px',
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
    } as React.CSSProperties,
    error: {
      marginTop: '16px',
      padding: '12px',
      backgroundColor: isDark ? '#7f1d1d' : '#fef2f2',
      borderRadius,
      border: `1px solid ${isDark ? '#dc2626' : '#fecaca'}`,
      color: isDark ? '#fca5a5' : '#dc2626',
      fontSize: '14px',
    } as React.CSSProperties,
    muted: {
      color: mutedColor,
      fontSize: '12px',
    } as React.CSSProperties,
  };
}

// ============================================================================
// Component
// ============================================================================

export function FlowRunner({
  apiKey,
  baseUrl,
  flowId,
  defaultInput = {},
  showInput = true,
  showProgress = true,
  showOutput = true,
  submitText = 'Run Flow',
  theme,
  className,
  onStart,
  onEvent,
  onComplete,
  onError,
}: FlowRunnerProps): React.ReactElement {
  const [inputValue, setInputValue] = useState(
    JSON.stringify(defaultInput, null, 2)
  );

  const { status, events, result, error, execute, reset } = useFlowRunner({
    apiKey,
    baseUrl,
    flowId,
    onStart,
    onEvent,
    onComplete,
    onError,
  });

  const styles = useMemo(() => getStyles(theme), [theme]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      try {
        const input = JSON.parse(inputValue);
        await execute(input);
      } catch (err) {
        if (err instanceof SyntaxError) {
          onError?.(new Error('Invalid JSON input'));
        }
      }
    },
    [inputValue, execute, onError]
  );

  const isRunning = status === 'running';

  return (
    <div style={styles.container} className={className}>
      {/* Keyframes for spinner */}
      <style>
        {`@keyframes baleyui-spin { to { transform: rotate(360deg); } }`}
      </style>

      {/* Input Form */}
      {showInput && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div>
            <label style={styles.label}>Input (JSON)</label>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isRunning}
              style={styles.textarea}
              placeholder='{"key": "value"}'
            />
          </div>
          <button
            type="submit"
            disabled={isRunning}
            style={{
              ...styles.button,
              ...(isRunning ? styles.buttonDisabled : {}),
            }}
          >
            {isRunning ? 'Running...' : submitText}
          </button>
        </form>
      )}

      {/* Progress */}
      {showProgress && isRunning && events.length > 0 && (
        <div style={styles.progress}>
          <div style={styles.progressHeader}>
            <div style={styles.spinner} />
            <span>Executing flow...</span>
          </div>
          <div style={styles.eventList}>
            {events.map((event, index) => (
              <div key={index} style={styles.event}>
                <span style={styles.muted}>[{event.type}]</span>{' '}
                {event.nodeId && `Node: ${event.nodeId}`}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {showOutput && status === 'completed' && result && (
        <div style={styles.output}>
          <div style={styles.outputTitle}>Output</div>
          <div style={styles.outputContent}>
            {typeof result.output === 'string'
              ? result.output
              : JSON.stringify(result.output, null, 2)}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error.message}
        </div>
      )}

      {/* Reset button after completion/error */}
      {(status === 'completed' || status === 'error') && (
        <button
          onClick={reset}
          style={{ ...styles.button, marginTop: '12px', opacity: 0.8 }}
        >
          Run Again
        </button>
      )}
    </div>
  );
}
