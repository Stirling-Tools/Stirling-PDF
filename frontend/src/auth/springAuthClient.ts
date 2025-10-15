/**
 * Spring Auth Client - Replaces Supabase client
 *
 * This client provides the same API surface as Supabase for authentication,
 * but integrates with the Spring Security + JWT backend instead.
 *
 * Main differences from Supabase:
 * - Uses HttpOnly cookies for JWT storage (more secure than localStorage)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 */

// Types matching Supabase structure for compatibility
export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  enabled?: boolean;
  is_anonymous?: boolean;
  app_metadata?: Record<string, any>;
}

export interface Session {
  user: User;
  access_token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}

export type AuthChangeEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

type AuthChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

/**
 * Spring Auth Client - Replaces Supabase client
 * Maintains same API surface as Supabase for easy migration
 */
class SpringAuthClient {
  private listeners: AuthChangeCallback[] = [];
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_CHECK_INTERVAL = 60000; // 1 minute
  private readonly TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes before expiry

  constructor() {
    // Start periodic session validation
    this.startSessionMonitoring();
  }

  /**
   * Get current session
   * Note: JWT is stored in HttpOnly cookie, so we can't read it directly
   * We check auth status by calling the /me endpoint
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // Verify with backend
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        // Not authenticated
        return { data: { session: null }, error: null };
      }

      const data = await response.json();

      // Create session object (we don't have access to the actual token due to HttpOnly)
      const session: Session = {
        user: data.user,
        access_token: '', // HttpOnly cookie, not accessible
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      return { data: { session }, error: null };
    } catch (error) {
      console.error('[SpringAuth] getSession error:', error);
      return {
        data: { session: null },
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        return { user: null, session: null, error: { message: error.error || 'Login failed' } };
      }

      const data = await response.json();
      const session: Session = {
        user: data.user,
        access_token: data.session.access_token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners('SIGNED_IN', session);

      return { user: data.user, session, error: null };
    } catch (error) {
      console.error('[SpringAuth] signInWithPassword error:', error);
      return {
        user: null,
        session: null,
        error: { message: error instanceof Error ? error.message : 'Login failed' },
      };
    }
  }

  /**
   * Sign up new user
   */
  async signUp(credentials: {
    email: string;
    password: string;
    options?: { data?: { full_name?: string }; emailRedirectTo?: string };
  }): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          name: credentials.options?.data?.full_name || '',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { user: null, session: null, error: { message: error.error || 'Registration failed' } };
      }

      const data = await response.json();

      // Note: Spring backend auto-confirms users (no email verification)
      // Return user but no session (user needs to login)
      return { user: data.user, session: null, error: null };
    } catch (error) {
      console.error('[SpringAuth] signUp error:', error);
      return {
        user: null,
        session: null,
        error: { message: error instanceof Error ? error.message : 'Registration failed' },
      };
    }
  }

  /**
   * Sign in with OAuth provider (GitHub, Google, etc.)
   * This redirects to the Spring OAuth2 authorization endpoint
   */
  async signInWithOAuth(params: {
    provider: 'github' | 'google' | 'apple' | 'azure';
    options?: { redirectTo?: string; queryParams?: Record<string, any> };
  }): Promise<{ error: AuthError | null }> {
    try {
      // Redirect to Spring OAuth2 endpoint
      const redirectUrl = `/oauth2/authorization/${params.provider}`;
      window.location.href = redirectUrl;
      return { error: null };
    } catch (error) {
      return {
        error: { message: error instanceof Error ? error.message : 'OAuth redirect failed' },
      };
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error) {
      console.error('[SpringAuth] signOut error:', error);
      return {
        error: { message: error instanceof Error ? error.message : 'Sign out failed' },
      };
    }
  }

  /**
   * Refresh session token
   */
  async refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return { data: { session: null }, error: { message: 'Token refresh failed' } };
      }

      // Get updated user info
      const userResponse = await fetch('/api/v1/auth/me', {
        credentials: 'include',
      });

      if (!userResponse.ok) {
        return { data: { session: null }, error: { message: 'Failed to get user info' } };
      }

      const userData = await userResponse.json();
      const session: Session = {
        user: userData.user,
        access_token: '', // HttpOnly cookie
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      // Notify listeners
      this.notifyListeners('TOKEN_REFRESHED', session);

      return { data: { session }, error: null };
    } catch (error) {
      console.error('[SpringAuth] refreshSession error:', error);
      return {
        data: { session: null },
        error: { message: error instanceof Error ? error.message : 'Refresh failed' },
      };
    }
  }

  /**
   * Listen to auth state changes (mimics Supabase onAuthStateChange)
   */
  onAuthStateChange(callback: AuthChangeCallback): { data: { subscription: { unsubscribe: () => void } } } {
    this.listeners.push(callback);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter((cb) => cb !== callback);
          },
        },
      },
    };
  }

  // Private helper methods

  private notifyListeners(event: AuthChangeEvent, session: Session | null) {
    // Use setTimeout to avoid calling callbacks synchronously
    setTimeout(() => {
      this.listeners.forEach((callback) => {
        try {
          callback(event, session);
        } catch (error) {
          console.error('[SpringAuth] Error in auth state change listener:', error);
        }
      });
    }, 0);
  }

  private startSessionMonitoring() {
    // Periodically check session validity
    // Since we use HttpOnly cookies, we just need to check with the server
    this.sessionCheckInterval = setInterval(async () => {
      try {
        // Try to get current session
        const { data } = await this.getSession();

        // If we have a session, proactively refresh if needed
        // (The server will handle token expiry, but we can be proactive)
        if (data.session) {
          const timeUntilExpiry = (data.session.expires_at || 0) - Date.now();

          // Refresh if token expires soon
          if (timeUntilExpiry > 0 && timeUntilExpiry < this.TOKEN_REFRESH_THRESHOLD) {
            console.log('[SpringAuth] Proactively refreshing token');
            await this.refreshSession();
          }
        }
      } catch (error) {
        console.error('[SpringAuth] Session monitoring error:', error);
      }
    }, this.SESSION_CHECK_INTERVAL);
  }

  public destroy() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
  }
}

// Export singleton instance (mimics Supabase pattern)
export const springAuth = new SpringAuthClient();

// Export helper functions (matching Supabase exports)

/**
 * Anonymous sign-in
 * Note: Not implemented yet - returns error
 */
export const signInAnonymously = async () => {
  // For now, return error - implement anonymous auth if needed
  return {
    data: { user: null, session: null },
    error: { message: 'Anonymous authentication not implemented' },
  };
};

/**
 * Get current user
 */
export const getCurrentUser = async () => {
  const { data } = await springAuth.getSession();
  return data.session?.user || null;
};

/**
 * Check if user is anonymous
 */
export const isUserAnonymous = (user: User | null) => {
  return user?.is_anonymous === true;
};

// Export auth client as default for convenience
export default springAuth;