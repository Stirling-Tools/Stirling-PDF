export interface AuthContextType {
  session: null;
  user: { id?: string; email?: string; [key: string]: unknown } | null;
  /**
   * Human-readable name for the signed-in user, or null if there is no
   * named user (anonymous, signed-out, or core OSS with no auth context).
   * Each layer derives this from its own native user shape - consumers
   * should treat the resulting string as opaque display text.
   */
  displayName: string | null;
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
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
  };
}
