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
import { type OAuthProvider } from '@app/auth/oauthTypes';
import { resetOAuthState } from '@app/auth/oauthStorage';
import { clearPlatformAuthAfterSignOut } from '@app/extensions/authSessionCleanup';
import { startOAuthNavigation } from '@app/extensions/oauthNavigation';

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
  authenticationType?: string;
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
  code?: string;
  mfaRequired?: boolean;
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
    mfaCode?: string;
  }): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/api/v1/auth/login', {
        username: credentials.email,
        password: credentials.password,
        mfaCode: credentials.mfaCode,
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
      if (error instanceof AxiosError) {
        const errorCode = error.response?.data?.error as string | undefined;
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'Login failed';
        return {
          user: null,
          session: null,
          error: {
            message: errorMessage,
            status: error.response?.status,
            code: errorCode,
            mfaRequired: errorCode === 'mfa_required',
          },
        };
      }
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
   * Sign in with OAuth/SAML provider (GitHub, Google, Authentik, etc.)
   * This redirects to the Spring OAuth2/SAML2 authorization endpoint
   *
   * @param params.provider - Full auth path from backend (e.g., '/oauth2/authorization/google', '/saml2/authenticate/stirling')
   *                          The backend provides the complete path including the auth type and provider ID
   */
  async signInWithOAuth(params: {
    provider: OAuthProvider;
    options?: { redirectTo?: string; queryParams?: Record<string, any> };
  }): Promise<{ error: AuthError | null }> {
    try {
      const redirectPath = normalizeRedirectPath(params.options?.redirectTo);
      persistRedirectPath(redirectPath);

      // Use the full path provided by the backend
      // This supports both OAuth2 (/oauth2/authorization/...) and SAML2 (/saml2/authenticate/...)
      const redirectUrl = params.provider;
      const handled = await startOAuthNavigation(redirectUrl);
      if (handled) {
        return { error: null };
      }
      // console.log('[SpringAuth] Redirecting to SSO:', redirectUrl);
      // Use window.location.assign for full page navigation
      window.location.assign(redirectUrl);
      return { error: null };
    } catch (error) {
      return {
        error: { message: error instanceof Error ? error.message : 'SSO redirect failed' },
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
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-') || key.includes('supabase'))
          .forEach((key) => localStorage.removeItem(key));

        // Clear any cached OAuth redirect/session state
        resetOAuthState();
      } catch (err) {
        console.warn('[SpringAuth] Failed to clear Supabase/local auth tokens', err);
      }

      // Clear cookies that might hold refresh/session tokens
      try {
        document.cookie.split(';').forEach(cookie => {
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          }
        });
      } catch (err) {
        console.warn('[SpringAuth] Failed to clear cookies on sign out', err);
      }

      try {
        await clearPlatformAuthAfterSignOut();
      } catch (cleanupError) {
        console.warn('[SpringAuth] Failed to run platform auth cleanup', cleanupError);
      }

      // Notify listeners
      this.notifyListeners('SIGNED_OUT', null);

      return { error: null };
    } catch (error: unknown) {
      console.error('[SpringAuth] signOut error:', error);
      // Still remove token even if backend call fails
      localStorage.removeItem('stirling_jwt');
      try {
        await clearPlatformAuthAfterSignOut();
      } catch (cleanupError) {
        console.warn('[SpringAuth] Failed to run platform auth cleanup after error', cleanupError);
      }
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
      const token = data.access_token;

      // Update local storage with new token
      localStorage.setItem('stirling_jwt', token);

      // Dispatch custom event for other components to react to JWT availability
      window.dispatchEvent(new CustomEvent('jwt-available'));

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.expires_in,
        expires_at: Date.now() + data.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners('TOKEN_REFRESHED', session);

      console.debug('[SpringAuth] Token refreshed successfully');

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
