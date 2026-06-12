/**
 * Auth/session seam (@app/auth/session).
 *
 * The cloud/ layer is the SHARED hosted experience consumed by BOTH the saas
 * (web) and desktop (Tauri) leaves. Each platform stores and refreshes the auth
 * token differently — saas keeps a Supabase web session, desktop keeps a JWT in
 * the Tauri secure store via authService. Cloud code must not reach either of
 * those directly, so it obtains the current access token through this seam.
 *
 * This module is the DEFAULT + the shared TypeScript contract. Real builds
 * shadow it with saas/auth/session.ts and desktop/auth/session.ts; this default
 * body is only reached by the cloud-standalone typecheck, so it is a safe no-op.
 */

/** Minimal session shape shared across platforms. */
export interface AppSession {
  /** Bearer access token for authenticated API calls, or null when signed out. */
  accessToken: string | null;
}

/**
 * Returns the current access token for authenticated API calls, or null when
 * no session is available. Each platform supplies its own implementation.
 */
export async function getAccessToken(): Promise<string | null> {
  return null;
}
