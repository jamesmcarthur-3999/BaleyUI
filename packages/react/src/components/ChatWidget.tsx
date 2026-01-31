/**
 * ChatWidget Component
 *
 * Embeddable chat interface for BaleyUI AI blocks.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useChatWidget } from '../hooks';
import type { ChatWidgetProps, ThemeConfig, ChatMessage } from '../types';

// ============================================================================
// Styles
// ============================================================================

function getStyles(theme: ThemeConfig = {}, maxHeight?: string | number) {
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
  const userBubbleBg = primaryColor;
  const assistantBubbleBg = isDark ? '#374151' : '#f3f4f6';

  const heightValue = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;

  return {
    container: {
      fontFamily,
      backgroundColor: bgColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius,
      display: 'flex',
      flexDirection: 'column' as const,
      height: heightValue || '500px',
      overflow: 'hidden',
    } as React.CSSProperties,
    header: {
      padding: '12px 16px',
      borderBottom: `1px solid ${borderColor}`,
      fontWeight: 600,
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    } as React.CSSProperties,
    headerDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: '#22c55e',
    } as React.CSSProperties,
    messages: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    } as React.CSSProperties,
    messageRow: (isUser: boolean) => ({
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }) as React.CSSProperties,
    messageBubble: (isUser: boolean) => ({
      maxWidth: '80%',
      padding: '10px 14px',
      borderRadius: '16px',
      backgroundColor: isUser ? userBubbleBg : assistantBubbleBg,
      color: isUser ? '#ffffff' : textColor,
      fontSize: '14px',
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap' as const,
      wordBreak: 'break-word' as const,
    }) as React.CSSProperties,
    timestamp: {
      fontSize: '10px',
      color: mutedColor,
      marginTop: '4px',
      textAlign: 'right' as const,
    } as React.CSSProperties,
    streamingCursor: {
      display: 'inline-block',
      width: '8px',
      height: '16px',
      backgroundColor: primaryColor,
      marginLeft: '2px',
      animation: 'baleyui-blink 1s step-end infinite',
    } as React.CSSProperties,
    inputContainer: {
      padding: '12px 16px',
      borderTop: `1px solid ${borderColor}`,
      display: 'flex',
      gap: '8px',
    } as React.CSSProperties,
    input: {
      flex: 1,
      padding: '10px 14px',
      fontSize: '14px',
      backgroundColor: isDark ? '#111827' : '#f9fafb',
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '20px',
      outline: 'none',
    } as React.CSSProperties,
    sendButton: {
      padding: '10px 16px',
      fontSize: '14px',
      fontWeight: 500,
      color: '#ffffff',
      backgroundColor: primaryColor,
      border: 'none',
      borderRadius: '20px',
      cursor: 'pointer',
      transition: 'opacity 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as React.CSSProperties,
    sendButtonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    } as React.CSSProperties,
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      textAlign: 'center' as const,
      color: mutedColor,
    } as React.CSSProperties,
    emptyIcon: {
      width: '48px',
      height: '48px',
      marginBottom: '12px',
      opacity: 0.5,
    } as React.CSSProperties,
    error: {
      padding: '8px 12px',
      margin: '0 16px 12px',
      backgroundColor: isDark ? '#7f1d1d' : '#fef2f2',
      borderRadius,
      border: `1px solid ${isDark ? '#dc2626' : '#fecaca'}`,
      color: isDark ? '#fca5a5' : '#dc2626',
      fontSize: '12px',
    } as React.CSSProperties,
  };
}

// ============================================================================
// Message Component
// ============================================================================

interface MessageProps {
  message: ChatMessage;
  styles: ReturnType<typeof getStyles>;
  showTimestamps: boolean;
}

function Message({ message, styles, showTimestamps }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div style={styles.messageRow(isUser)}>
      <div>
        <div style={styles.messageBubble(isUser)}>
          {message.content}
          {message.isStreaming && <span style={styles.streamingCursor} />}
        </div>
        {showTimestamps && (
          <div style={styles.timestamp}>
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ChatWidget({
  apiKey,
  baseUrl,
  blockId,
  title = 'Chat',
  placeholder = 'Type a message...',
  initialMessages = [],
  maxHeight,
  showTimestamps = false,
  theme,
  className,
  onMessageSent,
  onResponse,
  onError,
}: ChatWidgetProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, error, sendMessage } = useChatWidget({
    apiKey,
    baseUrl,
    blockId,
    initialMessages,
    onMessageSent,
    onResponse,
    onError,
  });

  const styles = useMemo(() => getStyles(theme, maxHeight), [theme, maxHeight]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isLoading) return;

      const message = inputValue;
      setInputValue('');
      await sendMessage(message);
    },
    [inputValue, isLoading, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  return (
    <div style={styles.container} className={className}>
      {/* Keyframes */}
      <style>
        {`@keyframes baleyui-blink { 50% { opacity: 0; } }`}
      </style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerDot} />
        {title}
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <svg
              style={styles.emptyIcon}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <div>Start a conversation</div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                styles={styles}
                showTimestamps={showTimestamps}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={styles.error}>
          {error.message}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={styles.inputContainer}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          style={styles.input}
        />
        <button
          type="submit"
          disabled={isLoading || !inputValue.trim()}
          style={{
            ...styles.sendButton,
            ...(isLoading || !inputValue.trim() ? styles.sendButtonDisabled : {}),
          }}
        >
          {isLoading ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              style={{ animation: 'baleyui-spin 1s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
