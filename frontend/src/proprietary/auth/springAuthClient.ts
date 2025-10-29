/**
 * Spring Auth Client
 *
 * This client integrates with the Spring Security + JWT backend.
 * - Uses localStorage for JWT storage (sent via Authorization header)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 */

// Auth types
export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  enabled?: boolean;
  is_anonymous?: boolean;
  isFirstLogin?: boolean;
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
   * Helper to get CSRF token from cookie
   */
  private getCsrfToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'XSRF-TOKEN') {
        return value;
      }
    }
    return null;
  }

  /**
   * Get current session
   * JWT is stored in localStorage and sent via Authorization header
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // Get JWT from localStorage
      const token = localStorage.getItem('stirling_jwt');

      if (!token) {
        console.debug('[SpringAuth] getSession: No JWT in localStorage');
        return { data: { session: null }, error: null };
      }

      // Verify with backend
      const response = await fetch('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Token invalid or expired - clear it
        localStorage.removeItem('stirling_jwt');
        console.debug('[SpringAuth] getSession: Not authenticated (status:', response.status, ')');
        return { data: { session: null }, error: null };
      }

      const data = await response.json();

      // Create session object
      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      console.debug('[SpringAuth] getSession: Session retrieved successfully');
      return { data: { session }, error: null };
    } catch (error) {
      console.error('[SpringAuth] getSession error:', error);
      // Clear potentially invalid token
      localStorage.removeItem('stirling_jwt');
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
        credentials: 'include', // Include cookies for CSRF
        body: JSON.stringify({
          username: credentials.email,
          password: credentials.password
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { user: null, session: null, error: { message: error.error || 'Login failed' } };
      }

      const data = await response.json();
      const token = data.session.access_token;

      // Store JWT in localStorage
      localStorage.setItem('stirling_jwt', token);
      console.log('[SpringAuth] JWT stored in localStorage');

      const session: Session = {
        user: data.user,
        access_token: token,
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
      const response = await fetch('/api/v1/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: credentials.email,
          password: credentials.password,
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
      // Redirect to Spring OAuth2 endpoint (Vite will proxy to backend)
      const redirectUrl = `/oauth2/authorization/${params.provider}`;
      console.log('[SpringAuth] Redirecting to OAuth:', redirectUrl);
      // Use window.location.assign for full page navigation
      window.location.assign(redirectUrl);
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
      // Clear JWT from localStorage immediately
      localStorage.removeItem('stirling_jwt');
      console.log('[SpringAuth] JWT removed from localStorage');

      const csrfToken = this.getCsrfToken();
      const headers: HeadersInit = {};

      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }

      // Notify backend (optional - mainly for session cleanup)
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers,
      });

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error) {
      console.error('[SpringAuth] signOut error:', error);
      // Still remove token even if backend call fails
      localStorage.removeItem('stirling_jwt');
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
      const currentToken = localStorage.getItem('stirling_jwt');

      if (!currentToken) {
        return { data: { session: null }, error: { message: 'No token to refresh' } };
      }

      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        localStorage.removeItem('stirling_jwt');
        return { data: { session: null }, error: { message: 'Token refresh failed' } };
      }

      const refreshData = await response.json();
      const newToken = refreshData.access_token;

      // Store new token
      localStorage.setItem('stirling_jwt', newToken);

      // Get updated user info
      const userResponse = await fetch('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${newToken}`,
        },
      });

      if (!userResponse.ok) {
        localStorage.removeItem('stirling_jwt');
        return { data: { session: null }, error: { message: 'Failed to get user info' } };
      }

      const userData = await userResponse.json();
      const session: Session = {
        user: userData.user,
        access_token: newToken,
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      // Notify listeners
      this.notifyListeners('TOKEN_REFRESHED', session);

      return { data: { session }, error: null };
    } catch (error) {
      console.error('[SpringAuth] refreshSession error:', error);
      localStorage.removeItem('stirling_jwt');
      return {
        data: { session: null },
        error: { message: error instanceof Error ? error.message : 'Refresh failed' },
      };
    }
  }

  /**
   * Listen to auth state changes
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

export const springAuth = new SpringAuthClient();

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

/**
 * Create an anonymous user object for use when login is disabled
 * This provides a consistent User interface throughout the app
 */
export const createAnonymousUser = (): User => {
  return {
    id: 'anonymous',
    email: 'anonymous@local',
    username: 'Anonymous User',
    role: 'USER',
    enabled: true,
    is_anonymous: true,
    app_metadata: {
      provider: 'anonymous',
    },
  };
};

/**
 * Create an anonymous session for use when login is disabled
 */
export const createAnonymousSession = (): Session => {
  return {
    user: createAnonymousUser(),
    access_token: '',
    expires_in: Number.MAX_SAFE_INTEGER,
    expires_at: Number.MAX_SAFE_INTEGER,
  };
};

// Export auth client as default for convenience
export default springAuth;
