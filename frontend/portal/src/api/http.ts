/**
 * Shared HTTP plumbing for the portal's service layer.
 *
 * Today everything is mocked in-process via {@link simulateNetwork}; when
 * we wire up a real backend, the helpers in `api/*.ts` switch from
 * `await simulateNetwork(); return MOCK_DATA;` to calling {@link httpJson}.
 * Consumers don't change.
 */

/** Simulated network latency, in ms. */
const DEFAULT_LATENCY_MS = 120;
const DEFAULT_JITTER_MS = 80;

/**
 * Sleeps for a small randomised duration so mocked endpoints feel like real
 * network calls (loading states actually show, race-condition bugs surface).
 */
export function simulateNetwork(options?: {
  latencyMs?: number;
  jitterMs?: number;
}): Promise<void> {
  const latency = options?.latencyMs ?? DEFAULT_LATENCY_MS;
  const jitter = options?.jitterMs ?? DEFAULT_JITTER_MS;
  const total = latency + Math.random() * jitter;
  return new Promise((resolve) => window.setTimeout(resolve, total));
}

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra headers; Content-Type and Accept are set automatically. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`${status} ${statusText}`);
    this.name = "HttpError";
  }
}

/**
 * Thin fetch wrapper for the future real backend. Currently unused — api
 * modules call simulateNetwork() and return mocks directly. Wired here so
 * the swap to a real backend is a per-endpoint change, not an architectural
 * one.
 */
export async function httpJson<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore — non-JSON error response
    }
    throw new HttpError(res.status, res.statusText, body);
  }
  return (await res.json()) as T;
}
