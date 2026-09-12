import { isAuthError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { getSupabaseClient } from "@app/auth/supabase/supabaseClient";
import { ensureSaasSupabase } from "@portal/auth/saasSupabase";

let refreshPromise: Promise<string | null> | null = null;
let generation = 0;
let snapshot = { required: false, revision: 0 };
const listeners = new Set<() => void>();
window.addEventListener(
  "stirling-saas-session-cleared",
  resetPortalSaasSessionState,
);

/** Browser authorization can expire while the instance remains linked. */
export class SaasSessionRequiredError extends Error {
  constructor() {
    super("Sign in again to renew access to your Stirling account.");
    this.name = "SaasSessionRequiredError";
  }
}

/** Subscribe to terminal auth failures and successful callback recovery. */
export function subscribePortalSaasSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPortalSaasSessionState() {
  return snapshot;
}

/** Invalidates pending renewal results when the local user or link changes. */
export function resetPortalSaasSessionState(): void {
  generation++;
  refreshPromise = null;
  update(false);
}

/** Publish only after the callback has validated and installed the session. */
export function portalSaasSessionRestored(): void {
  generation++;
  refreshPromise = null;
  update(false);
}

function update(required: boolean): void {
  snapshot = { required, revision: snapshot.revision + 1 };
  listeners.forEach((listener) => listener());
}

function sessionRequired(): never {
  if (!snapshot.required) update(true);
  throw new SaasSessionRequiredError();
}

/** Terminal provider failures require a fresh sign-in, not another attempt with the same tokens. */
export function isTerminalSaasAuthError(error: unknown): boolean {
  return (
    isAuthSessionMissingError(error) ||
    (isAuthError(error) &&
      (error.status === 401 ||
        [
          "refresh_token_not_found",
          "refresh_token_already_used",
          "session_not_found",
          "user_not_found",
          "user_banned",
        ].includes(error.code ?? "")))
  );
}

/** SDK getSession renews expired tokens; transient auth failures remain retryable errors. */
export async function getPortalSaasToken(): Promise<string | null> {
  ensureSaasSupabase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const started = generation;
  const { data, error } = await supabase.auth.getSession();
  if (!getSupabaseClient() || started !== generation) return null;
  if (error && !isTerminalSaasAuthError(error)) throw error;
  return error ? null : (data.session?.access_token ?? null);
}

/** Coalesces 401 recovery and reuses a token already renewed by another request. */
export function refreshPortalSaasToken(
  rejectedToken: string,
): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const started = generation;
  const pending = (async () => {
    const current = await getPortalSaasToken();
    if (started !== generation) return null;
    if (!current || current !== rejectedToken) return current;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.refreshSession();
    if (!getSupabaseClient() || started !== generation) return null;
    if (error && !isTerminalSaasAuthError(error)) throw error;
    return error ? null : (data.session?.access_token ?? null);
  })();
  refreshPromise = pending;
  void pending
    .finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    })
    .catch(() => {});
  return pending;
}

/** Only repeat operations explicitly known to be safe to replay; never retry transport failures. */
export async function withPortalSaasSession<T>(
  send: (token: string) => Promise<T>,
  unauthorized: (response: T) => boolean,
  retry: boolean = false,
): Promise<T> {
  const started = generation;
  const token = await getPortalSaasToken();
  if (started !== generation) throw new SaasSessionRequiredError();
  if (!token) return sessionRequired();
  const response = await send(token);
  if (started !== generation) throw new SaasSessionRequiredError();
  if (!unauthorized(response)) return response;
  if (!retry) return sessionRequired();
  const renewed = await refreshPortalSaasToken(token);
  if (started !== generation) throw new SaasSessionRequiredError();
  if (!renewed) return sessionRequired();
  const retried = await send(renewed);
  if (started !== generation) throw new SaasSessionRequiredError();
  if (unauthorized(retried)) return sessionRequired();
  return retried;
}
