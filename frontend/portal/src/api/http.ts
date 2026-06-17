/**
 * Shared HTTP plumbing for the portal's service layer.
 *
 * Every `api/*.ts` module calls {@link httpJson}, which issues a real `fetch`.
 * In dev and Storybook those requests are intercepted by the MSW handlers in
 * `mocks/` and answered with fixture data; pointing at a real backend is just
 * a matter of not registering MSW. Consumers don't change either way.
 *
 * Requests are routed through the active backend target (see
 * {@link getActiveTarget}): it supplies the base URL and the auth headers, so
 * `api/*.ts` stays path-only and agnostic of which backend (SaaS today,
 * self-hosted later) it's talking to.
 */

import { getActiveTarget } from "@portal/api/backendTarget";

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
 * Thin JSON fetch wrapper used by every api module. In dev/Storybook the
 * request is served by MSW; against a real backend it hits the network.
 */
export async function httpJson<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const target = getActiveTarget();
  const authHeaders = await target.getAuthHeaders();
  const res = await fetch(`${target.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders,
      // Per-call headers win, so a caller can override auth when needed.
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
