import { createContext, useContext, ReactNode } from 'react';
import type { AuthContextType } from '@proprietary/auth/types';

/**
 * Desktop-specific AuthProvider override
 *
 * Desktop app uses its own authService (src/desktop/services/authService.ts)
 * for handling both SaaS (Supabase) and self-hosted (Spring Boot) authentication.
 *
 * This provider is a no-op to prevent the proprietary Spring Boot auth client
 * from being used in desktop mode, which would cause issues like:
 * - Calling /api/v1/auth/me on Supabase server (which doesn't have that endpoint)
 * - Infinite token refresh loops
 *
 * The desktop app manages auth state through:
 * - authService.ts for token management
 * - useFirstLaunchCheck for initialization
 * - SetupWizard for login flows
 */

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: false,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
});

/**
 * Desktop AuthProvider - No-op implementation
 * Desktop app handles auth via authService.ts
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextType = {
    session: null,
    user: null,
    loading: false,
    error: null,
    signOut: async () => {
      console.debug('[Desktop Auth] signOut called - desktop uses authService.logout()');
    },
    refreshSession: async () => {
      console.debug('[Desktop Auth] refreshSession called - desktop uses authService.refreshToken()');
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
