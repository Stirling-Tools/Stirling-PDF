/**
 * Portal API client — explicit per-backend, per-credential routing.
 *
 * ## Domains
 *
 *   apiClient.local           Same-origin (vite proxy → this instance's local
 *                             Stirling backend on :8080). Spring admin bearer
 *                             (`stirling_jwt` from @shared/auth) auto-attached.
 *                             USE FOR: actions on this instance —
 *                             /api/v1/account-link/{status,link,unlink}, etc.
 *
 *   apiClient.saas            VITE_SAAS_API_URL (hosted SaaS Java). The admin's
 *                             Supabase JWT (from the account-link login,
 *                             persisted + SDK-refreshed) is auto-attached.
 *                             USE FOR: attended portal→SaaS reads —
 *                             /api/v1/payg/wallet, etc.
 *                             Throws SaasUnconfiguredError when VITE_SAAS_API_URL
 *                             is missing — callers surface a clear "configure"
 *                             state rather than silently routing to the wrong
 *                             domain.
 *
 *   apiClient.mock            Same wire shape as `local` (same-origin fetch)
 *                             BUT semantically marks paths that only exist in
 *                             MSW handlers (e.g. /v1/billing/*). With Mocks=on
 *                             they intercept; with Mocks=off they hit the local
 *                             backend and 404 (because those endpoints aren't
 *                             real on either backend). Use until the path is
 *                             migrated to a real SaaS endpoint via apiClient.saas.
 *
 * ## Why this is split, not a single function
 *
 * The two backends speak two credentials and resolve different identities. A
 * single generic fetch reading the path prefix to pick a domain is implicit +
 * fragile (the bug we hit: /v1/billing/wallet fell through to the local
 * backend on a real run). Forcing the call site to say `.local` / `.saas` /
 * `.mock` keeps the routing intent reviewable in diffs.
 *
 * ## Device credential isn't here
 *
 * The instance↔SaaS device credential ({@code X-Device-Id}+{@code X-Device-Secret})
 * is a server-side credential the local backend uses for UNATTENDED metering /
 * entitlement calls. It never enters the portal — the browser is the human
 * admin and uses the Supabase JWT for SaaS reads. Don't add it here.
 */
import { getStoredToken } from "@shared/auth";
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

/** Read the SaaS base URL at call time so tests can stub it via vi.stubEnv. */
function saasBaseUrl(): string | null {
  const raw = import.meta.env.VITE_SAAS_API_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra headers; Content-Type and Accept are set automatically. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Thrown by any apiClient call on non-2xx response, with the parsed body. */
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

/** Thrown by apiClient.saas.* when VITE_SAAS_API_URL isn't set. */
export class SaasUnconfiguredError extends Error {
  constructor() {
    super(
      "SaaS API not configured — set VITE_SAAS_API_URL to enable portal→SaaS reads.",
    );
    this.name = "SaasUnconfiguredError";
  }
}

/** Thrown by apiClient.saas.* when the admin has no SaaS session yet. */
export class SaasNotLinkedError extends Error {
  constructor() {
    super(
      "No SaaS session — admin must link an account before attended SaaS reads.",
    );
    this.name = "SaasNotLinkedError";
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

// ────────────────────────────────────────────────────────────────────────────
// Shared response handler
// ────────────────────────────────────────────────────────────────────────────

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore — non-JSON error response
    }
    throw new HttpError(res.status, res.statusText, body);
  }
  // 204 / empty-body responses have nothing to parse.
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ────────────────────────────────────────────────────────────────────────────
// local — same-origin Stirling backend, Spring admin bearer
// ────────────────────────────────────────────────────────────────────────────

function localAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function localJson<T>(
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
      ...localAuthHeader(),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  return unwrap<T>(res);
}

// ────────────────────────────────────────────────────────────────────────────
// saas — hosted SaaS Java, admin's Supabase JWT
// ────────────────────────────────────────────────────────────────────────────

async function getSaasAccessToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function saasJson<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const base = saasBaseUrl();
  if (!base) throw new SaasUnconfiguredError();
  const token = await getSaasAccessToken();
  if (!token) throw new SaasNotLinkedError();
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  return unwrap<T>(res);
}

// ────────────────────────────────────────────────────────────────────────────
// Exported API client
// ────────────────────────────────────────────────────────────────────────────

export const apiClient = {
  /** Local backend (this instance). Spring admin bearer auto-attached. */
  local: {
    json: localJson,
  },
  /** Hosted SaaS Java. Admin's Supabase JWT auto-attached. */
  saas: {
    json: saasJson,
    /** True when VITE_SAAS_API_URL is set. Doesn't check session liveness. */
    isConfigured: (): boolean => Boolean(saasBaseUrl()),
  },
  /**
   * Same wire shape as `local`, but the path is an MSW-only invention (never
   * served by the local backend OR SaaS). Calls hit MSW when mocks are on, and
   * 404 against the local backend when mocks are off — that's intentional;
   * migrate the call to `apiClient.saas` once the real endpoint exists.
   */
  mock: {
    json: localJson,
  },
} as const;
