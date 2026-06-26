/**
 * Shared HTTP plumbing for the portal's service layer.
 *
 * Every `api/*.ts` module calls {@link httpJson}, which issues a real `fetch`.
 * In dev and Storybook those requests are intercepted by the MSW handlers in
 * `mocks/` and answered with fixture data; pointing at a real backend is just
 * a matter of not registering MSW. Consumers don't change either way.
 *
 * The shared `stirling_jwt` bearer token (set by the auth gate, and shared
 * same-origin with the editor) is attached automatically so portal data calls
 * are authenticated once real backend endpoints exist.
 */
import { getStoredToken } from "@shared/auth";

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
 * Best-effort human-readable message from a thrown error: unwraps an
 * {@link HttpError}'s ProblemDetail-ish body (`detail` / `message` / `error`)
 * before falling back to the error's own message. Shared by views that surface
 * a failed request inline.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    const body = error.body as {
      detail?: string;
      message?: string;
      error?: string;
    } | null;
    return body?.detail ?? body?.message ?? body?.error ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function authHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Thin JSON fetch wrapper used by every api module. In dev/Storybook the
 * request is served by MSW; against a real backend it hits the network.
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
      ...authHeader(),
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
