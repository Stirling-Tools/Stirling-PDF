/**
 * Auth/session seam (@app/auth/session). saas keeps a Supabase web session;
 * desktop keeps a JWT in the Tauri secure store — cloud code reads the token
 * through this seam instead. Default no-op; saas/ and desktop/ shadow it.
 */

/** Minimal session shape shared across platforms. */
export interface AppSession {
  /** Bearer access token for authenticated API calls, or null when signed out. */
  accessToken: string | null;
}

/** The current access token for authenticated API calls, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  return null;
}
