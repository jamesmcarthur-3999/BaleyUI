/**
 * Execute a BaleyBot via the execute-stream SSE endpoint.
 * Returns the final execution result.
 *
 * @param {object} options
 * @param {string} options.baseUrl - Base URL (e.g. http://localhost:3000)
 * @param {string} options.botId - BaleyBot ID
 * @param {string} options.apiKey - API key (bui_live_* or bui_test_*)
 * @param {string} options.input - Input text for the bot
 * @param {(event: object) => void} [options.onEvent] - Optional callback for each SSE event
 * @returns {Promise<object>} The execution_result event payload
 */
export async function executeBaleyBot({ baseUrl, botId, apiKey, input, onEvent }) {
  const url = `${baseUrl}/api/baleybots/${botId}/execute-stream`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input,
      triggeredBy: 'manual',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let executionResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE frames (data: ...\n\n)
    const lines = buffer.split('\n');
    buffer = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('data: ')) {
        const data = line.slice(6);

        if (data === '[DONE]') {
          return executionResult;
        }

        try {
          const event = JSON.parse(data);
          if (onEvent) onEvent(event);

          if (event.type === 'execution_result') {
            executionResult = event;
          }
        } catch {
          // Incomplete JSON — put it back in the buffer
          buffer = lines.slice(i).join('\n');
          break;
        }
      } else if (line !== '' && !line.startsWith(':')) {
        // Non-empty, non-comment line that isn't a data line — keep in buffer
        buffer += line + '\n';
      }
    }
  }

  if (!executionResult) {
    throw new Error('Stream ended without execution_result event');
  }

  return executionResult;
}
