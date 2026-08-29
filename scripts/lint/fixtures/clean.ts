/**
 * Auth/session seam. saas keeps a Supabase web session; desktop keeps a JWT in
 * the Tauri secure store, and cloud code reads the token through here instead.
 * Default no-op; saas/ and desktop/ shadow it.
 */
export interface SessionSeam {
  /** Bearer access token for authenticated API calls, or null when signed out. */
  getAccessToken(): Promise<string | null>;
}

export function createSeam(): SessionSeam {
  return {
    // Resolves null rather than throwing: a signed-out caller is an ordinary
    // state here, and every consumer already branches on null.
    getAccessToken: async () => null,
  };
}
