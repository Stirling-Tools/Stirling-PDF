/**
 * Spring Auth Client
 *
 * This client integrates with the Spring Security + JWT backend.
 * - Uses localStorage for JWT storage (sent via Authorization header)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 */

import apiClient from '@app/services/apiClient';

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
      // Note: We pass the token explicitly here, overriding the interceptor's default
      const response = await apiClient.get('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = response.data;

      // Create session object
      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      console.debug('[SpringAuth] getSession: Session retrieved successfully');
      return { data: { session }, error: null };
    } catch (error: any) {
      console.error('[SpringAuth] getSession error:', error);

      // If 401/403, token is invalid - clear it
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        localStorage.removeItem('stirling_jwt');
        console.debug('[SpringAuth] getSession: Not authenticated');
        return { data: { session: null }, error: null };
      }

      // Clear potentially invalid token on other errors too
      localStorage.removeItem('stirling_jwt');
      return {
        data: { session: null },
        error: { message: error?.response?.data?.message || error?.message || 'Unknown error' },
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
      const response = await apiClient.post('/api/v1/auth/login', {
        username: credentials.email,
        password: credentials.password
      }, {
        withCredentials: true, // Include cookies for CSRF
      });

      const data = response.data;
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
    } catch (error: any) {
      console.error('[SpringAuth] signInWithPassword error:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Login failed';
      return {
        user: null,
        session: null,
        error: { message: errorMessage },
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
      const response = await apiClient.post('/api/v1/user/register', {
        username: credentials.email,
        password: credentials.password,
      }, {
        withCredentials: true,
      });

      const data = response.data;

      // Note: Spring backend auto-confirms users (no email verification)
      // Return user but no session (user needs to login)
      return { user: data.user, session: null, error: null };
    } catch (error: any) {
      console.error('[SpringAuth] signUp error:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Registration failed';
      return {
        user: null,
        session: null,
        error: { message: errorMessage },
      };
    }
  }

  /**
   * Sign in with OAuth provider (GitHub, Google, etc.)
   * Redirects to Spring OAuth2 authorization endpoint
   */
  async signInWithOAuth(params: {
    provider: 'github' | 'google' | 'apple' | 'azure';
    options?: { redirectTo?: string; queryParams?: Record<string, any> };
  }): Promise<{ error: AuthError | null }> {
    try {
      const redirectUrl = `/oauth2/authorization/${params.provider}`;
      console.log('[SpringAuth] Redirecting to OAuth:', redirectUrl);
      window.location.assign(redirectUrl);
      return { error: null };
    } catch (error) {
      return {
        error: { message: error instanceof Error ? error.message : 'OAuth redirect failed' },
      };
    }
  }

  /**
   * Send password reset email
   * Not used in OSS version, but included for completeness
   */
  async resetPasswordForEmail(email: string): Promise<{ data: {}; error: AuthError | null }> {
    try {
      await apiClient.post('/api/v1/auth/reset-password', {
        email,
      }, {
        withCredentials: true,
      });

      return { data: {}, error: null };
    } catch (error: any) {
      console.error('[SpringAuth] resetPasswordForEmail error:', error);
      return {
        data: {},
        error: {
          message: error?.response?.data?.error || error?.message || 'Password reset failed',
        },
      };
    }
  }

  /**
   * Sign out user (invalidate session)
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const response = await apiClient.post('/api/v1/auth/logout', null, {
        headers: {
          'X-CSRF-TOKEN': this.getCsrfToken() || '',
        },
        withCredentials: true,
      });

      if (response.status === 200) {
        console.debug('[SpringAuth] signOut: Success');
      }

      // Clean up local storage
      localStorage.removeItem('stirling_jwt');

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error: any) {
      console.error('[SpringAuth] signOut error:', error);
      return {
        error: {
          message: error?.response?.data?.error || error?.message || 'Logout failed',
        },
      };
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      const response = await apiClient.post('/api/v1/auth/refresh', null, {
        headers: {
          'X-CSRF-TOKEN': this.getCsrfToken() || '',
        },
        withCredentials: true,
      });

      const data = response.data;
      const token = data.session.access_token;

      // Update local storage with new token
      localStorage.setItem('stirling_jwt', token);

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners('TOKEN_REFRESHED', session);

      return { data: { session }, error: null };
    } catch (error: any) {
      console.error('[SpringAuth] refreshSession error:', error);
      localStorage.removeItem('stirling_jwt');

      // Handle different error statuses
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return { data: { session: null }, error: { message: 'Token refresh failed - please log in again' } };
      }

      return {
        data: { session: null },
        error: { message: error?.response?.data?.message || error?.message || 'Token refresh failed' },
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
