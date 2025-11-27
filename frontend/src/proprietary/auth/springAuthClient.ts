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
import type {
  User,
  Session,
  AuthError,
  AuthResponse,
  AuthChangeEvent,
  AuthChangeCallback,
} from '@app/auth/types';

// Re-export types
export type {
  User,
  Session,
  AuthError,
  AuthResponse,
  AuthChangeEvent,
};

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
   * JWT is stored in localStorage and sent via Authorization header
   */
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    try {
      // Get JWT from localStorage
      const token = localStorage.getItem('stirling_jwt');

      if (!token) {
        // console.debug('[SpringAuth] getSession: No JWT in localStorage');
        return { data: { session: null }, error: null };
      }

      // Verify with backend
      // Note: We pass the token explicitly here, overriding the interceptor's default
      // console.debug('[SpringAuth] getSession: Verifying JWT with /api/v1/auth/me');
      const response = await apiClient.get('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        suppressErrorToast: true, // Suppress global error handler (we handle errors locally)
      });

      // console.debug('[SpringAuth] /me response status:', response.status);
      const data = response.data;
      // console.debug('[SpringAuth] /me response data:', data);

      // Create session object
      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: 3600,
        expires_at: Date.now() + 3600 * 1000,
      };

      // console.debug('[SpringAuth] getSession: Session retrieved successfully');
      return { data: { session }, error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] getSession error:', error);

      // If 401/403, token is invalid - clear it
      if (error instanceof AxiosError && (error.response?.status === 401 || error.response?.status === 403)) {
        localStorage.removeItem('stirling_jwt');
        console.debug('[SpringAuth] getSession: Not authenticated');
        return { data: { session: null }, error: null };
      }

      // Don't clear token for other errors (e.g., backend not ready, network issues)
      // The token is still valid, just can't verify it right now
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
        withCredentials: true, // Include cookies for CSRF
      });

      const data = response.data;
      const token = data.session.access_token;

      // Store JWT in localStorage
      localStorage.setItem('stirling_jwt', token);
      // console.log('[SpringAuth] JWT stored in localStorage');

      // Dispatch custom event for other components to react to JWT availability
      window.dispatchEvent(new CustomEvent('jwt-available'));

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
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

      // Clean up local storage
      localStorage.removeItem('stirling_jwt');

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] signOut error:', error);
      // Still remove token even if backend call fails
      localStorage.removeItem('stirling_jwt');
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

      const data = response.data;
      const token = data.session.access_token;

      // Update local storage with new token
      localStorage.setItem('stirling_jwt', token);

      // Dispatch custom event for other components to react to JWT availability
      window.dispatchEvent(new CustomEvent('jwt-available'));

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners('TOKEN_REFRESHED', session);

      return { data: { session }, error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] refreshSession error:', error);
      localStorage.removeItem('stirling_jwt');

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

// Re-export shared utilities
export {
  isUserAnonymous,
  createAnonymousUser,
  createAnonymousSession,
} from '@app/auth/utils';

// Export auth client as default for convenience
export default springAuth;
