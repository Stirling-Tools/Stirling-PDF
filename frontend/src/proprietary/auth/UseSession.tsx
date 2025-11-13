import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { springAuth } from '@app/auth/springAuthClient';
import type { Session, User, AuthError, AuthChangeEvent } from '@app/auth/springAuthClient';

/**
 * Auth Context Type
 * Simplified version without SaaS-specific features (credits, subscriptions)
 */
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
});

/**
 * Auth Provider Component
 *
 * Manages authentication state and provides it to the entire app.
 * Integrates with Spring Security + JWT backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  /**
   * Refresh current session
   */
  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.debug('[Auth] Refreshing session...');

      const { data, error } = await springAuth.refreshSession();

      if (error) {
        console.error('[Auth] Session refresh error:', error);
        setError(error);
        setSession(null);
      } else {
        console.debug('[Auth] Session refreshed successfully');
        setSession(data.session);
      }
    } catch (err) {
      console.error('[Auth] Unexpected error during session refresh:', err);
      setError(err as AuthError);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Sign out user
   */
  const signOut = useCallback(async () => {
    try {
      setError(null);
      console.debug('[Auth] Signing out...');

      const { error } = await springAuth.signOut();

      if (error) {
        console.error('[Auth] Sign out error:', error);
        setError(error);
      } else {
        console.debug('[Auth] Signed out successfully');
        setSession(null);
      }
    } catch (err) {
      console.error('[Auth] Unexpected error during sign out:', err);
      setError(err as AuthError);
    }
  }, []);

  /**
   * Initialize auth on mount
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.debug('[Auth] Initializing auth...');

        // Skip auth check if we're on auth pages
        // Need to check for paths with or without base path
        const pathname = window.location.pathname;
        const isAuthPage = pathname.endsWith('/login') ||
                          pathname.endsWith('/signup') ||
                          pathname.endsWith('/auth/callback') ||
                          pathname.includes('/auth/') ||
                          pathname.includes('/invite/');

        if (isAuthPage) {
          console.log('[Auth] On auth page, completely skipping session check');
          console.log('[Auth] Current path:', pathname);
          setLoading(false);
          return;
        }

        // GUARD: Check if JWT exists before making session call
        const hasJWT = localStorage.getItem('stirling_jwt');
        if (!hasJWT) {
          console.debug('[Auth] No JWT token found, skipping session check');
          setLoading(false);
          return;
        }

        // Skip config check entirely - let the app handle login state
        // The config will be fetched by useAppConfig when needed
        const { data, error } = await springAuth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('[Auth] Initial session error:', error);
          setError(error);
        } else {
          console.debug('[Auth] Initial session loaded:', {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
          });
          setSession(data.session);
        }
      } catch (err) {
        console.error('[Auth] Unexpected error during auth initialization:', err);
        if (mounted) {
          setError(err as AuthError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for jwt-available event (triggered by desktop auth or other sources)
    const handleJwtAvailable = async () => {
      console.debug('[Auth] JWT available event received, refreshing session');
      void initializeAuth();
    };

    window.addEventListener('jwt-available', handleJwtAvailable);

    // Subscribe to auth state changes
    const { data: { subscription } } = springAuth.onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {
        if (!mounted) return;

        console.debug('[Auth] Auth state change:', {
          event,
          hasSession: !!newSession,
          userId: newSession?.user?.id,
          email: newSession?.user?.email,
          timestamp: new Date().toISOString(),
        });

        // Schedule state update
        setTimeout(() => {
          if (mounted) {
            setSession(newSession);
            setError(null);

            // Handle specific events
            if (event === 'SIGNED_OUT') {
              console.debug('[Auth] User signed out, clearing session');
            } else if (event === 'SIGNED_IN') {
              console.debug('[Auth] User signed in successfully');
            } else if (event === 'TOKEN_REFRESHED') {
              console.debug('[Auth] Token refreshed');
            } else if (event === 'USER_UPDATED') {
              console.debug('[Auth] User updated');
            }
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      window.removeEventListener('jwt-available', handleJwtAvailable);
      subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    loading,
    error,
    signOut,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Debug hook to expose auth state for debugging
 * Can be used in development to monitor auth state
 */
export function useAuthDebug() {
  const auth = useAuth();

  useEffect(() => {
    console.debug('[Auth Debug] Current auth state:', {
      hasSession: !!auth.session,
      hasUser: !!auth.user,
      loading: auth.loading,
      hasError: !!auth.error,
      userId: auth.user?.id,
      email: auth.user?.email,
    });
  }, [auth.session, auth.user, auth.loading, auth.error]);

  return auth;
}
