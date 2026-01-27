export interface AuthContextType {
  session: null;
  user: null;
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
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
  };
}
