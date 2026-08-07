export interface AuthContextType {
  session: null;
  user: { id?: string; email?: string; [key: string]: unknown } | null;
  /**
   * Human-readable name to show in the UI for the current session.
   * - A real identity (username/email/full_name) when the user is signed in.
   * - A layer-specific placeholder (e.g. "Guest" in SaaS, "User" in
   *   proprietary) for anonymous sessions.
   * - null only when there is no user object at all (signed-out, or core
   *   OSS with no auth context) - consumers can fall back to whatever
   *   makes sense in their build.
   *
   * Each layer derives this from its own native user shape - consumers
   * should treat the resulting string as opaque display text.
   */
  displayName: string | null;
  /**
   * Whether the current session is an anonymous / guest one. Each layer
   * derives this from its own native user shape (Supabase `is_anonymous` in
   * SaaS, the Spring anonymous flag in proprietary). Always `false` in core
   * OSS, which has no auth context. Consumers use it to gate account-only
   * actions (cloud folders, MCP) without reaching into a layer-specific user.
   */
  isAnonymous: boolean;
  loading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Core (open-source) auth hook stub.
 * Proprietary/desktop builds override this file via path resolution.
 */
export function useAuth(): AuthContextType {
  return {
    session: null,
    user: null,
    displayName: null,
    isAnonymous: false,
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
  };
}
