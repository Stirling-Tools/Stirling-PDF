/**
 * Spring Auth Client
 *
 * This client integrates with the Spring Security + JWT backend.
 * - Uses HttpOnly cookies for JWT storage (automatic secure storage)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 * - Refresh tokens stored in separate HttpOnly cookie
 */

// Auth types
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

export interface AuthConfig {
  secureCookie: boolean;
  jwtEnabled: boolean;
}

class SpringAuthClient {
  private listeners: AuthChangeCallback[] = [];
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private readonly SESSION_CHECK_INTERVAL = 60000; // 1 minute
  private readonly TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes before expiry
  private authConfig: AuthConfig | null = null;

  constructor() {
    // Load auth config
    this.loadAuthConfig();
    // Start periodic session validation
    this.startSessionMonitoring();
  }

  /**
   * Load authentication configuration from backend
   */
  private async loadAuthConfig() {
    try {
      const response = await fetch('/api/v1/auth/config', {
        credentials: 'include',
      });

      if (response.ok) {
        this.authConfig = await response.json();
        console.debug('[SpringAuth] Auth config loaded:', this.authConfig);
      } else {
        console.warn('[SpringAuth] Failed to load auth config');
      }
    } catch (error) {
      console.error('[SpringAuth] Error loading auth config:', error);
    }
  }

  /**
   * Get authentication configuration
   */
  getAuthConfig(): AuthConfig | null {
    return this.authConfig;
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
   * JWT is stored in HttpOnly cookie (automatic with credentials: 'include')
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // Verify with backend (JWT automatically sent via HttpOnly cookie)
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include', // Include cookies
      });

      if (!response.ok) {
        console.debug('[SpringAuth] getSession: Not authenticated (status:', response.status, ')');
        return { data: { session: null }, error: null };
      }

      const data = await response.json();

      // Create session object (no access_token in JS - it's in HttpOnly cookie)
      const session: Session = {
        user: data.user,
        access_token: '', // Not accessible to JavaScript (stored in HttpOnly cookie)
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      console.debug('[SpringAuth] getSession: Session retrieved successfully');
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

      // JWT is now stored in HttpOnly cookie by backend (no localStorage needed)
      console.log('[SpringAuth] JWT stored in HttpOnly cookie by backend');

      const session: Session = {
        user: data.user,
        access_token: '', // Not accessible to JavaScript (stored in HttpOnly cookie)
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
   * Sign out - revokes refresh tokens and clears HttpOnly cookies
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      console.log('[SpringAuth] Signing out, clearing HttpOnly cookies');

      const csrfToken = this.getCsrfToken();
      const headers: HeadersInit = {};

      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }

      // Notify backend to revoke refresh tokens and clear cookies
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
      return {
        error: { message: error instanceof Error ? error.message : 'Sign out failed' },
      };
    }
  }

  /**
   * Refresh session token using refresh token (automatically sent via HttpOnly cookie)
   */
  async refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // Refresh token is automatically sent via HttpOnly cookie
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return { data: { session: null }, error: { message: 'Token refresh failed' } };
      }

      // Backend sets new access token and refresh token in HttpOnly cookies

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
        access_token: '', // Not accessible to JavaScript (stored in HttpOnly cookie)
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
