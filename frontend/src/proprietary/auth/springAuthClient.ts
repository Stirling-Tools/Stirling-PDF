/**
 * Spring Auth Client
 *
 * This client integrates with the Spring Security + JWT backend.
 * - Uses localStorage for JWT storage (sent via Authorization header)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 */

import apiClient from '@app/services/apiClient';
import { AxiosError } from 'axios';
import { BASE_PATH } from '@app/constants/app';

// Helper to extract error message from axios error
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.response?.data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

const OAUTH_REDIRECT_COOKIE = 'stirling_redirect_path';
const OAUTH_REDIRECT_COOKIE_MAX_AGE = 60 * 5; // 5 minutes
const DEFAULT_REDIRECT_PATH = `${BASE_PATH || ''}/auth/callback`;

function normalizeRedirectPath(target?: string): string {
  if (!target || typeof target !== 'string') {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const parsed = new URL(target, window.location.origin);
    const path = parsed.pathname || '/';
    const query = parsed.search || '';
    return `${path}${query}`;
  } catch {
    const trimmed = target.trim();
    if (!trimmed) {
      return DEFAULT_REDIRECT_PATH;
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
}

function persistRedirectPath(path: string): void {
  try {
    document.cookie = `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=${OAUTH_REDIRECT_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch (_error) {
    // console.warn('[SpringAuth] Failed to persist OAuth redirect path', _error);
  }
}

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
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Get current session
   * JWT is in HttpOnly cookie - backend reads it automatically
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // JWT is in HttpOnly cookie - backend will read it automatically
//       console.debug('[SpringAuth] getSession: Verifying session with /api/v1/auth/me');
      const response = await apiClient.get('/api/v1/auth/me', {
        withCredentials: true, // Include cookies
        suppressErrorToast: true, // Suppress global error handler (we handle errors locally)
      });

      // console.debug('[SpringAuth] /me response status:', response.status);
      const data = response.data;
      // console.debug('[SpringAuth] /me response data:', data);

      // Create session object (no token on client side)
      const session: Session = {
        user: data.user,
        expires_in: 21600, // 6 hours
        expires_at: Date.now() + 21600 * 1000,
      };

      // console.debug('[SpringAuth] getSession: Session retrieved successfully');
      return { data: { session }, error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] getSession error:', error);

      // If 401/403, not authenticated
      if (error instanceof AxiosError && (error.response?.status === 401 || error.response?.status === 403)) {
        console.debug('[SpringAuth] getSession: Not authenticated');
        return { data: { session: null }, error: null };
      }

      return {
        data: { session: null },
        error: { message: getErrorMessage(error, 'Unknown error') },
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
        withCredentials: true, // Include cookies for CSRF and receive JWT cookie
      });

      const data = response.data;

      // JWT is now in HttpOnly cookie - no localStorage needed
      // console.log('[SpringAuth] Login successful - JWT in cookie');

      const session: Session = {
        user: data.user,
        expires_in: 21600, // 6 hours
        expires_at: Date.now() + 21600 * 1000,
      };

      // Notify listeners
      this.notifyListeners('SIGNED_IN', session);

      return { user: data.user, session, error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] signInWithPassword error:', error);
      return {
        user: null,
        session: null,
        error: { message: getErrorMessage(error, 'Login failed') },
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
    } catch (error: unknown) {
      console.error('[SpringAuth] signUp error:', error);
      return {
        user: null,
        session: null,
        error: { message: getErrorMessage(error, 'Registration failed') },
      };
    }
  }

  /**
   * Sign in with OAuth provider (GitHub, Google, etc.)
   * This redirects to the Spring OAuth2 authorization endpoint
   */
  async signInWithOAuth(params: {
    provider: 'github' | 'google' | 'apple' | 'azure' | 'keycloak' | 'oidc';
    options?: { redirectTo?: string; queryParams?: Record<string, any> };
  }): Promise<{ error: AuthError | null }> {
    try {
      const redirectPath = normalizeRedirectPath(params.options?.redirectTo);
      persistRedirectPath(redirectPath);

      // Redirect to Spring OAuth2 endpoint (Vite will proxy to backend)
      const redirectUrl = `/oauth2/authorization/${params.provider}`;
      // console.log('[SpringAuth] Redirecting to OAuth:', redirectUrl);
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
   * Sign out user (invalidate session)
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const response = await apiClient.post('/api/v1/auth/logout', null, {
        headers: {
          'X-XSRF-TOKEN': this.getCsrfToken() || '',
        },
        withCredentials: true,
      });

      if (response.status === 200) {
        // console.debug('[SpringAuth] signOut: Success');
      }

      // No need to clean up localStorage - cookie is cleared by server

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] signOut error:', error);
      return {
        error: { message: getErrorMessage(error, 'Logout failed') },
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
          'X-XSRF-TOKEN': this.getCsrfToken() || '',
        },
        withCredentials: true,
        suppressErrorToast: true, // Suppress global error handler (we handle errors locally)
      });

      // Get user info from current session
      const sessionResult = await this.getSession();
      if (sessionResult.data.session) {
        // Notify listeners
        this.notifyListeners('TOKEN_REFRESHED', sessionResult.data.session);
        return sessionResult;
      }

      return { data: { session: null }, error: { message: 'Failed to get session after refresh' } };
    } catch (error: unknown) {
      console.error('[SpringAuth] refreshSession error:', error);

      // Handle different error statuses
      if (error instanceof AxiosError && (error.response?.status === 401 || error.response?.status === 403)) {
        return { data: { session: null }, error: { message: 'Token refresh failed - please log in again' } };
      }

      return {
        data: { session: null },
        error: { message: getErrorMessage(error, 'Token refresh failed') },
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
            // console.log('[SpringAuth] Proactively refreshing token');
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
    expires_in: Number.MAX_SAFE_INTEGER,
    expires_at: Number.MAX_SAFE_INTEGER,
  };
};

// Export auth client as default for convenience
export default springAuth;
