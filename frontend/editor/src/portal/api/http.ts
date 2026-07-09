/**
 * Portal API client — explicit per-backend, per-credential routing.
 *
 * ## Domains
 *
 *   apiClient.local           This instance's backend, via the localBackend seam.
 *                             Self-hosted: same-origin (vite proxy → local Stirling
 *                             backend on :8080), Spring admin bearer. SaaS: there is
 *                             no separate local instance, so it targets the one SaaS
 *                             backend with the Supabase JWT (same as .saas).
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
 * Endpoints that don't have a real backend yet still target their eventual
 * domain (almost always `.local`): with Mocks=on the MSW handlers intercept;
 * with Mocks=off they hit the real backend and 404 until the route ships, then
 * self-heal — no call-site migration needed.
 *
 * ## Why this is split, not a single function
 *
 * The two backends speak two credentials and resolve different identities. A
 * single generic fetch reading the path prefix to pick a domain is implicit +
 * fragile (the bug we hit: /v1/billing/wallet fell through to the local
 * backend on a real run). Forcing the call site to say `.local` / `.saas`
 * keeps the routing intent reviewable in diffs.
 *
 * ## Device credential isn't here
 *
 * The instance↔SaaS device credential ({@code X-Device-Id}+{@code X-Device-Secret})
 * is a server-side credential the local backend uses for UNATTENDED metering /
 * entitlement calls. It never enters the portal — the browser is the human
 * admin and uses the Supabase JWT for SaaS reads. Don't add it here.
 */
import { getPortalSaasToken } from "@portal/auth/portalSaasSession";
import { saasApiBase } from "@portal/api/saasApiBase";
import {
  localAuthHeader,
  localBaseUrl,
  onLocalUnauthorized,
} from "@portal/api/localBackend";

/**
 * SaaS base URL via the flavor seam: self-hosted reads VITE_SAAS_API_URL (a
 * separate cloud backend); the SaaS build reuses the editor's single
 * VITE_API_BASE_URL (in SaaS everything is the SaaS backend). {@code null} means
 * not configured — a self-hosted-only state; the SaaS seam never returns null.
 */
function saasBaseUrl(): string | null {
  return saasApiBase();
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
// local — this instance's backend, via the localBackend seam (base URL + auth).
// Self-hosted: same-origin + Spring bearer. SaaS: the SaaS backend + Supabase JWT.
// ────────────────────────────────────────────────────────────────────────────

async function localJson<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const res = await fetch(`${localBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(await localAuthHeader()),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (res.status === 401) {
    // Stale/invalid credential — let the flavor decide (self-hosted clears the
    // Spring token to re-show login; SaaS lets the auth boundary handle it).
    onLocalUnauthorized();
  }
  return unwrap<T>(res);
}

/** GET returning a binary Blob (e.g. a CSV/JSON export download), via the
 * localBackend seam — same base + auth as localJson (SaaS backend + Supabase JWT
 * on SaaS, same-origin + Spring bearer self-hosted). */
async function localBlob(
  path: string,
  options: HttpRequestOptions = {},
): Promise<Blob> {
  const res = await fetch(`${localBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: { ...(await localAuthHeader()), ...options.headers },
    signal: options.signal,
  });
  if (res.status === 401) {
    onLocalUnauthorized();
  }
  if (!res.ok) throw new HttpError(res.status, res.statusText, null);
  return res.blob();
}

/** POST an application/x-www-form-urlencoded body (Spring @RequestParam endpoints),
 * via the localBackend seam — same base + auth as localJson. */
async function localForm<T>(
  path: string,
  params: Record<string, string>,
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  const res = await fetch(`${localBaseUrl()}${path}`, {
    method,
    headers: { Accept: "application/json", ...(await localAuthHeader()) },
    body: new URLSearchParams(params),
  });
  if (res.status === 401) {
    onLocalUnauthorized();
  }
  return unwrap<T>(res);
}

// ────────────────────────────────────────────────────────────────────────────
// saas — hosted SaaS Java, admin's Supabase JWT
// ────────────────────────────────────────────────────────────────────────────

async function saasJson<T>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const base = saasBaseUrl();
  // null = unset (self-hosted, no VITE_SAAS_API_URL). "" is same-origin (SaaS) — valid.
  if (base === null) throw new SaasUnconfiguredError();
  const token = await getPortalSaasToken();
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

/** Fetch a plain-text SaaS response (e.g. a downloadable licence file). Throws on a non-2xx. */
async function saasText(
  path: string,
  options: HttpRequestOptions = {},
): Promise<string> {
  const base = saasBaseUrl();
  // null = unset (self-hosted, no VITE_SAAS_API_URL). "" is same-origin (SaaS) — valid.
  if (base === null) throw new SaasUnconfiguredError();
  const token = await getPortalSaasToken();
  if (!token) throw new SaasNotLinkedError();
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "text/plain",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    signal: options.signal,
  });
  if (!res.ok) {
    throw new Error(`SaaS request failed (${res.status})`);
  }
  return res.text();
}

/** SaaS GET returning a binary Blob, with the Supabase JWT attached. */
async function saasBlob(
  path: string,
  options: HttpRequestOptions = {},
): Promise<Blob> {
  const base = saasBaseUrl();
  // Same-origin SaaS resolves to "" (falsy); only null means unconfigured.
  if (base === null) throw new SaasUnconfiguredError();
  const token = await getPortalSaasToken();
  if (!token) throw new SaasNotLinkedError();
  const res = await fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    signal: options.signal,
  });
  if (!res.ok) throw new HttpError(res.status, res.statusText, null);
  return res.blob();
}

// ────────────────────────────────────────────────────────────────────────────
// Exported API client
// ────────────────────────────────────────────────────────────────────────────

export const apiClient = {
  /** Local backend (this instance). Spring admin bearer auto-attached. */
  local: {
    json: localJson,
    form: localForm,
    blob: localBlob,
  },
  /** Hosted SaaS Java. Admin's Supabase JWT auto-attached. */
  saas: {
    json: saasJson,
    text: saasText,
    blob: saasBlob,
    /** True when a SaaS base URL is resolvable. Doesn't check session liveness. */
    isConfigured: (): boolean => saasBaseUrl() !== null,
  },
} as const;
