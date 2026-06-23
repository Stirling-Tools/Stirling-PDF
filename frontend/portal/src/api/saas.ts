/**
 * Direct portal → SaaS Java fetcher for ATTENDED admin reads (wallet, billing,
 * plans, checkout). Authenticates with the admin's Supabase JWT — the same
 * credential the SaaS web app uses; the SaaS backend's existing JWT chain
 * validates it.
 *
 * Contrast with {@link httpJson} (api/http.ts), which targets the LOCAL backend
 * (same origin via the vite proxy) and carries the Spring admin bearer.
 *
 * Distinct from the device credential (unattended, narrow-scope, instance
 * metering only) — humans browsing the portal use their own session, devices
 * use their own credential.
 *
 * Config: VITE_SAAS_API_URL. When absent, {@link isSaasApiConfigured} is false
 * and callers fall back to local mock data so dev/Storybook flows still work.
 */
import { getSupabaseClient } from "@shared/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

const baseUrl = import.meta.env.VITE_SAAS_API_URL;

export const isSaasApiConfigured = Boolean(baseUrl);

export interface SaasRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class SaasApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`${status} ${statusText}`);
    this.name = "SaasApiError";
  }
}

/** Resolves the current Supabase access token, or null if unconfigured / signed out. */
async function getSaasAccessToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fetch from the SaaS Java backend with the admin's Supabase JWT. Throws
 * {@link SaasApiError} on non-2xx (callers decide whether to fall back).
 */
export async function saasJson<T>(
  path: string,
  options: SaasRequestOptions = {},
): Promise<T> {
  if (!baseUrl) {
    throw new Error(
      "SaaS API is not configured — set VITE_SAAS_API_URL to enable portal→SaaS reads.",
    );
  }
  const token = await getSaasAccessToken();
  if (!token) {
    throw new Error(
      "No SaaS session — admin must link an account before attended SaaS reads.",
    );
  }
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
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
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore — non-JSON error response
    }
    throw new SaasApiError(res.status, res.statusText, body);
  }
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
