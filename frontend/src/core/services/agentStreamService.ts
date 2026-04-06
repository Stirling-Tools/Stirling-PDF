/**
 * SSE client for streaming agent chat events.
 *
 * Uses fetch() + ReadableStream (not EventSource, since we need POST).
 * Parses the text/event-stream format line-by-line.
 */

import type { ChatEvent } from '@app/types/agentChat';
import { getApiBaseUrl } from '@app/services/apiClientConfig';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  message: string;
  conversationId?: string;
  fileNames?: string[];
  extractedText?: string;
  history?: ChatHistoryItem[];
  onEvent: (event: ChatEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

function buildApiUrl(baseUrl: string | undefined, apiPath: string): string {
  const normalizedBase = (baseUrl ?? '').trim();
  if (!normalizedBase || normalizedBase === '/') {
    return apiPath;
  }
  return `${normalizedBase.replace(/\/+$/, '')}${apiPath}`;
}

function getAuthHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem('stirling_jwt');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Ignore storage access issues and continue without auth header.
  }
  return {};
}

/**
 * Start a streaming chat session. Returns an AbortController for cancellation.
 */
export function startAgentStream(options: StreamOptions): AbortController {
  const controller = new AbortController();

  const baseUrl = getApiBaseUrl();
  const url = buildApiUrl(baseUrl, '/api/v1/ai/chat/stream');

  const body = JSON.stringify({
    message: options.message,
    conversationId: options.conversationId ?? null,
    fileNames: options.fileNames ?? [],
    extractedText: options.extractedText ?? null,
    history: options.history ?? [],
  });

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...getAuthHeaders(),
    },
    body,
    signal: controller.signal,
    credentials: 'include',
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('No response body');
      }
      return readSSEStream(response.body, options);
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        options.onComplete();
        return;
      }
      options.onError(error instanceof Error ? error : new Error(String(error)));
    });

  return controller;
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  options: StreamOptions
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        // SSE spec: field is before first ':', value is after with optional leading space
        if (line.startsWith('event:')) {
          currentEvent = line.substring(line.indexOf(':') + 1).trimStart();
        } else if (line.startsWith('data:')) {
          currentData += line.substring(line.indexOf(':') + 1).trimStart();
        } else if (line === '' && currentData) {
          // End of SSE event
          try {
            const parsed = JSON.parse(currentData);
            const event: ChatEvent = {
              eventType: currentEvent,
              runId: parsed.runId ?? '',
              agentId: parsed.agentId ?? '',
              agentName: parsed.agentName,
              parentAgentId: parsed.parentAgentId,
              delta: parsed.delta,
              status: parsed.status,
              result: parsed.result,
              resultSummary: parsed.resultSummary,
              durationMs: parsed.durationMs,
              actionType: parsed.actionType,
              actionPayload: parsed.actionPayload,
              error: parsed.error,
            };
            options.onEvent(event);
          } catch {
            console.warn('[AgentStream] Failed to parse SSE data:', currentData);
          }
          currentEvent = 'message';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  options.onComplete();
}

/**
 * Fetch the list of available agents.
 */
export async function fetchAgentList(): Promise<
  Array<{ agentId: string; name: string; description: string; category: string }>
> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(buildApiUrl(baseUrl, '/api/v1/ai/agents'), {
    headers: {
      ...getAuthHeaders(),
    },
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch agents: ${response.status}`);
  }
  return response.json();
}
