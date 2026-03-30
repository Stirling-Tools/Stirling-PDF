/**
 * Module-level singleton SSE connection for pipeline job notifications.
 *
 * Uses localStorage for the sessionId so it is shared across tabs on the same browser/machine —
 * all tabs receive job-complete / job-failed events for the same user's jobs.
 *
 * Auth: in JWT mode, the frontend first calls POST /api/v1/pipeline/sse-token (with the JWT in
 * the Authorization header — safe, never in the URL) to obtain a one-time sseToken, then opens
 * EventSource with ?sseToken=…. Non-JWT deployments rely on the session cookie sent automatically
 * by EventSource when withCredentials: true is set.
 *
 * Reconnects automatically with exponential backoff (1 s → 30 s) when the connection drops.
 */

import { useEffect } from 'react';

const SESSION_KEY = 'pipeline-session-id';

// ---------------------------------------------------------------------------
// Typed SSE event shapes
// ---------------------------------------------------------------------------

export type PipelineSSEEvent =
  | { type: 'job-complete'; jobId: string }
  | { type: 'job-failed'; jobId: string; error?: string }
  | { type: 'server-folder-complete'; folderId: string; outputFiles: string[] }
  | { type: 'server-folder-error'; folderId: string; failedFileIds: string[] };

/** Parse an untyped SSE message payload into a typed event, or null if unrecognised. */
export function parsePipelineSSEEvent(data: unknown): PipelineSSEEvent | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.type === 'job-complete' && typeof d.jobId === 'string') {
    return { type: 'job-complete', jobId: d.jobId };
  }
  if (d.type === 'job-failed' && typeof d.jobId === 'string') {
    return {
      type: 'job-failed',
      jobId: d.jobId,
      error: typeof d.error === 'string' ? d.error : undefined,
    };
  }
  if (d.type === 'server-folder-complete' && typeof d.folderId === 'string') {
    return {
      type: 'server-folder-complete',
      folderId: d.folderId,
      outputFiles: Array.isArray(d.outputFiles)
        ? d.outputFiles.filter((x): x is string => typeof x === 'string')
        : [],
    };
  }
  if (d.type === 'server-folder-error' && typeof d.folderId === 'string') {
    return {
      type: 'server-folder-error',
      folderId: d.folderId,
      failedFileIds: Array.isArray(d.failedFileIds)
        ? d.failedFileIds.filter((x): x is string => typeof x === 'string')
        : [],
    };
  }
  return null;
}

/** Returns (or generates) the stable sessionId for this browser. */
export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Singleton EventSource state
// ---------------------------------------------------------------------------

let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1_000;
let connecting = false;

// All registered handlers — called with the parsed JSON data object for every message
const globalHandlers = new Set<(data: unknown) => void>();

function dispatch(data: unknown) {
  globalHandlers.forEach(h => {
    try { h(data); } catch { /* don't let one handler break others */ }
  });
}

async function connect(): Promise<void> {
  if (es && es.readyState !== EventSource.CLOSED) return;
  if (connecting) return;
  connecting = true;

  try {
    const sessionId = getSessionId();
    let url = `/api/v1/pipeline/events?session=${encodeURIComponent(sessionId)}`;

    // JWT mode: exchange for a one-time sseToken so the JWT never appears in the URL
    const jwt = localStorage.getItem('stirling_jwt');
    if (jwt) {
      try {
        const resp = await fetch('/api/v1/pipeline/sse-token', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `session=${encodeURIComponent(sessionId)}`,
        });
        if (resp.ok) {
          const data = await resp.json() as { sseToken: string };
          url += `&sseToken=${encodeURIComponent(data.sseToken)}`;
        }
      } catch {
        // Token exchange failed — fall through to cookie auth (withCredentials: true)
      }
    }

    es = new EventSource(url, { withCredentials: true });

    es.onopen = () => {
      reconnectDelay = 1_000; // reset backoff on successful connect
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        dispatch(JSON.parse(event.data as string));
      } catch {
        // ignore unparseable messages
      }
    };

    es.onerror = () => {
      es?.close();
      es = null;
      connecting = false; // allow reconnect to proceed
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        void connect();
      }, reconnectDelay);
    };
  } finally {
    connecting = false;
  }
}

/**
 * Register a handler that receives every SSE message (parsed JSON).
 * Returns a cleanup function that removes the handler.
 *
 * Also ensures the connection is open — safe to call before the DOM is ready.
 */
export function addSSEHandler(handler: (data: unknown) => void): () => void {
  globalHandlers.add(handler);
  void connect();
  return () => globalHandlers.delete(handler);
}

/**
 * Hook that ensures the SSE connection is open while the component is mounted.
 * Mount this once near the app root (e.g. inside useFolderAutomation's useEffect).
 */
export function useSSEConnection(): void {
  useEffect(() => {
    void connect();
  }, []);
}
