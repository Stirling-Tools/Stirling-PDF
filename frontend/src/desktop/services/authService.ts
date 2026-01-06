import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import axios from 'axios';
import { DESKTOP_DEEP_LINK_CALLBACK, STIRLING_SAAS_URL, SUPABASE_KEY } from '@app/constants/connection';

export interface UserInfo {
  username: string;
  email?: string;
}

interface LoginResponse {
  token: string;
  username: string;
  email: string | null;
}

interface OAuthCallbackResult {
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
}

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'refreshing' | 'oauth_pending';

export class AuthService {
  private static instance: AuthService;
  private authStatus: AuthStatus = 'unauthenticated';
  private userInfo: UserInfo | null = null;
  private cachedToken: string | null = null;
  private authListeners = new Set<(status: AuthStatus, userInfo: UserInfo | null) => void>();

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Save token to all storage locations and notify listeners
   */
  private async saveTokenEverywhere(token: string): Promise<void> {
    // Validate token before caching
    if (!token || token.trim().length === 0) {
      console.warn('[Desktop AuthService] Attempted to save invalid/empty token');
      throw new Error('Invalid token');
    }

    try {
      // Save to Tauri store
      await invoke('save_auth_token', { token });
      console.log('[Desktop AuthService] ✅ Token saved to Tauri store');
    } catch (error) {
      console.error('[Desktop AuthService] ❌ Failed to save token to Tauri store:', error);
      // Don't throw - we can still use localStorage
    }

    try {
      // Sync to localStorage for web layer
      localStorage.setItem('stirling_jwt', token);
      console.log('[Desktop AuthService] ✅ Token saved to localStorage');
    } catch (error) {
      console.error('[Desktop AuthService] ❌ Failed to save token to localStorage:', error);
    }

    // Cache the valid token in memory
    this.cachedToken = token;
    console.log('[Desktop AuthService] ✅ Token cached in memory');

    // Notify other parts of the system
    window.dispatchEvent(new CustomEvent('jwt-available'));
    console.log('[Desktop AuthService] Dispatched jwt-available event');
  }

  /**
   * Get token from any available source (Tauri store or localStorage)
   */
  private async getTokenFromAnySource(): Promise<string | null> {
    // Try Tauri store first
    try {
      const token = await invoke<string | null>('get_auth_token');

      if (token) {
        console.log(`[Desktop AuthService] ✅ Token found in Tauri store (length: ${token.length})`);
        return token;
      }

      console.log('[Desktop AuthService] ℹ️ No token in Tauri store, checking localStorage...');
    } catch (error) {
      console.error('[Desktop AuthService] ❌ Failed to read from Tauri store:', error);
    }

    // Fallback to localStorage
    const localStorageToken = localStorage.getItem('stirling_jwt');
    if (localStorageToken) {
      console.log(`[Desktop AuthService] ✅ Token found in localStorage (length: ${localStorageToken.length})`);
    } else {
      console.log('[Desktop AuthService] ❌ No token found in any storage');
    }

    return localStorageToken;
  }

  /**
   * Clear token from all storage locations
   */
  private async clearTokenEverywhere(): Promise<void> {
    // Invalidate cache
    this.cachedToken = null;
    console.log('[Desktop AuthService] Cache invalidated');

    // Best effort: clear Tauri keyring
    try {
      await invoke('clear_auth_token');
      console.log('[Desktop AuthService] Cleared Tauri keyring token');
    } catch (error) {
      console.warn('[Desktop AuthService] Failed to clear Tauri keyring token', error);
    }

    // Best effort: clear web storage
    try {
      localStorage.removeItem('stirling_jwt');
      console.log('[Desktop AuthService] Cleared localStorage token');
    } catch (error) {
      console.warn('[Desktop AuthService] Failed to clear localStorage token', error);
    }
  }

  /**
   * Local clear only (no backend calls) to reset auth state in desktop contexts
   */
  async localClearAuth(): Promise<void> {
    await this.clearTokenEverywhere().catch(() => {});
    try {
      await invoke('clear_user_info');
    } catch (err) {
      console.warn('[Desktop AuthService] Failed to clear user info', err);
    }
    this.setAuthStatus('unauthenticated', null);
  }

  subscribeToAuth(listener: (status: AuthStatus, userInfo: UserInfo | null) => void): () => void {
    this.authListeners.add(listener);
    // Immediately notify new listener of current state
    listener(this.authStatus, this.userInfo);
    return () => {
      this.authListeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.authListeners.forEach(listener => listener(this.authStatus, this.userInfo));
  }

  private setAuthStatus(status: AuthStatus, userInfo: UserInfo | null = null) {
    this.authStatus = status;
    this.userInfo = userInfo;
    this.notifyListeners();
  }

  async completeSupabaseSession(accessToken: string, serverUrl: string): Promise<UserInfo> {
    if (!accessToken || !accessToken.trim()) {
      throw new Error('Invalid access token');
    }
    if (!SUPABASE_KEY) {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not configured');
    }

    await this.saveTokenEverywhere(accessToken);

    const userInfo = await this.fetchSupabaseUserInfo(serverUrl, accessToken);

    await invoke('save_user_info', {
      username: userInfo.username,
      email: userInfo.email || null,
    });

    this.setAuthStatus('authenticated', userInfo);
    return userInfo;
  }

  async signUpSaas(email: string, password: string): Promise<void> {
    if (!STIRLING_SAAS_URL) {
      throw new Error('VITE_SAAS_SERVER_URL is not configured');
    }
    if (!SUPABASE_KEY) {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not configured');
    }

    const redirectParam = encodeURIComponent(DESKTOP_DEEP_LINK_CALLBACK);
    const signupUrl = `${STIRLING_SAAS_URL.replace(/\/$/, '')}/auth/v1/signup?redirect_to=${redirectParam}`;

    try {
      const response = await axios.post(
        signupUrl,
        { email, password, email_redirect_to: DESKTOP_DEEP_LINK_CALLBACK },
        {
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      if (response.status >= 400) {
        throw new Error('Sign up failed');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message =
          error.response?.data?.error_description ||
          error.response?.data?.msg ||
          error.response?.data?.message ||
          error.message;
        throw new Error(message || 'Sign up failed');
      }
      throw error instanceof Error ? error : new Error('Sign up failed');
    }
  }

  async login(serverUrl: string, username: string, password: string): Promise<UserInfo> {
    try {
      console.log('Logging in to:', serverUrl);

      // Validate SaaS configuration if connecting to SaaS
      if (serverUrl === STIRLING_SAAS_URL) {
        if (!STIRLING_SAAS_URL) {
          throw new Error('VITE_SAAS_SERVER_URL is not configured');
        }
        if (!SUPABASE_KEY) {
          throw new Error('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not configured');
        }
      }

      // Call Rust login command (bypasses CORS)
      const response = await invoke<LoginResponse>('login', {
        serverUrl,
        username,
        password,
        supabaseKey: SUPABASE_KEY,
        saasServerUrl: STIRLING_SAAS_URL,
      });

      const { token, username: returnedUsername, email } = response;

      console.log('[Desktop AuthService] Login successful, saving token...');

      // Save token to all storage locations
      try {
        await this.saveTokenEverywhere(token);
      } catch (error) {
        console.error('[Desktop AuthService] Failed to save token:', error);
        throw new Error('Failed to save authentication token');
      }

      // Save user info to store
      await invoke('save_user_info', {
        username: returnedUsername || username,
        email,
      });

      const userInfo: UserInfo = {
        username: returnedUsername || username,
        email: email || undefined,
      };

      this.setAuthStatus('authenticated', userInfo);

      console.log('Login successful');
      return userInfo;
    } catch (error) {
      console.error('Login failed:', error);
      this.setAuthStatus('unauthenticated', null);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      console.log('Logging out');

      // Best-effort backend logout so any server-side session/cookies are cleared
      try {
        const currentConfig = await connectionModeService.getCurrentConfig().catch(() => null);
        const serverUrl = currentConfig?.server_config?.url;
        const token = await this.getAuthToken();

        if (serverUrl && token) {
          const base = serverUrl.replace(/\/+$/, '');
          const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

          // Treat 401/403 as benign (session already expired)
          const safePost = async (url: string) => {
            try {
              const resp = await axios.post(url, null, {
                headers,
                withCredentials: true,
                validateStatus: () => true, // handle status manually
              });
              if (resp.status >= 400 && ![401, 403].includes(resp.status)) {
                console.warn(`[Desktop AuthService] Logout call to ${url} failed: ${resp.status}`);
              }
            } catch (err) {
              console.warn(`[Desktop AuthService] Backend logout failed via ${url}`, err);
            }
          };

          await safePost(`${base}/api/v1/auth/logout`);

          // Also attempt framework logout endpoint to clear cookies/sessions
          await safePost(`${base}/logout`);
        }
      } catch (err) {
        console.warn('[Desktop AuthService] Failed to call backend logout endpoint', err);
      }

      // Clear token from all storage locations
      await this.clearTokenEverywhere();

      // Clear user info from Tauri store
      await invoke('clear_user_info');

      this.setAuthStatus('unauthenticated', null);

      console.log('Logged out successfully');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still set status to unauthenticated even if clear fails
      this.setAuthStatus('unauthenticated', null);
      // Still try to clear token
      await this.clearTokenEverywhere().catch(() => {});
    }
  }

  async getAuthToken(): Promise<string | null> {
    try {
      // Return cached token if available
      if (this.cachedToken) {
        console.debug('[Desktop AuthService] ✅ Returning cached token');
        return this.cachedToken;
      }

      console.debug('[Desktop AuthService] Cache miss, fetching from storage...');
      const token = await this.getTokenFromAnySource();

      // Cache the token if valid
      if (token && token.trim().length > 0) {
        this.cachedToken = token;
        console.log('[Desktop AuthService] ✅ Token cached in memory after retrieval');
      }

      return token;
    } catch (error) {
      console.error('[Desktop AuthService] Failed to get auth token:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAuthToken();
    return token !== null;
  }

  async getUserInfo(): Promise<UserInfo | null> {
    if (this.userInfo) {
      console.log('[Desktop AuthService] Using cached user info:', this.userInfo.username);
      return this.userInfo;
    }

    try {
      console.log('[Desktop AuthService] Retrieving user info from store...');
      const userInfo = await invoke<UserInfo | null>('get_user_info');
      if (userInfo) {
        console.log('[Desktop AuthService] User info found:', userInfo.username);
        this.userInfo = userInfo;
      } else {
        console.log('[Desktop AuthService] No user info in store');
      }
      return userInfo;
    } catch (error) {
      console.error('[Desktop AuthService] Failed to get user info from store:', error);
      return null;
    }
  }

  async refreshToken(serverUrl: string): Promise<boolean> {
    try {
      console.log('Refreshing auth token');
      this.setAuthStatus('refreshing', this.userInfo);

      const currentToken = await this.getAuthToken();
      if (!currentToken) {
        this.setAuthStatus('unauthenticated', null);
        return false;
      }

      // Call the server's refresh endpoint
      const response = await axios.post(
        `${serverUrl}/api/v1/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      const { token } = response.data;

      // Save token to all storage locations
      await this.saveTokenEverywhere(token);

      const userInfo = await this.getUserInfo();
      this.setAuthStatus('authenticated', userInfo);

      console.log('Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.setAuthStatus('unauthenticated', null);

      // Clear stored credentials on refresh failure
      await this.logout();

      return false;
    }
  }

  async initializeAuthState(): Promise<void> {
    console.log('[Desktop AuthService] Initializing auth state...');
    // If we are on the login/setup screen, don't auto-restore a previous session; clear instead
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/login') || path.startsWith('/setup')) {
      console.log('[Desktop AuthService] On login/setup path, clearing any cached auth');
      // Local clear only; avoid backend logout to prevent noisy errors when already unauthenticated
      await this.clearTokenEverywhere().catch(() => {});
      try {
        await invoke('clear_user_info');
      } catch (err) {
        console.warn('[Desktop AuthService] Failed to clear user info on login/setup init', err);
      }
      this.setAuthStatus('unauthenticated', null);
      return;
    }

    const token = await this.getAuthToken();
    const userInfo = await this.getUserInfo();

    if (token && userInfo) {
      console.log('[Desktop AuthService] Found token, syncing to all storage locations');

      // Ensure token is in both Tauri store and localStorage
      await this.saveTokenEverywhere(token);

      this.setAuthStatus('authenticated', userInfo);
      console.log('[Desktop AuthService] Auth state initialized as authenticated');
    } else {
      console.log('[Desktop AuthService] No token or user info found');
      this.setAuthStatus('unauthenticated', null);
      console.log('[Desktop AuthService] Auth state initialized as unauthenticated');

      // Defensive: ensure any partial tokens are purged to prevent auto-login loops
      await this.clearTokenEverywhere().catch(() => {});
    }
  }

  /**
   * Start OAuth login flow by opening system browser with localhost callback
   */
  async loginWithOAuth(provider: string, authServerUrl: string, successHtml: string, errorHtml: string): Promise<UserInfo> {
    try {
      console.log('Starting OAuth login with provider:', provider);
      this.setAuthStatus('oauth_pending', null);

      // Validate Supabase key is configured for OAuth
      if (!SUPABASE_KEY) {
        throw new Error('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not configured');
      }

      // Call Rust command which:
      // 1. Starts localhost HTTP server on random port
      // 2. Opens browser to OAuth provider
      // 3. Waits for callback
      // 4. Returns tokens
      const result = await invoke<OAuthCallbackResult>('start_oauth_login', {
        provider,
        authServerUrl,
        supabaseKey: SUPABASE_KEY,
        successHtml,
        errorHtml,
      });

      console.log('OAuth authentication successful, storing tokens');

      // Save token to all storage locations
      await this.saveTokenEverywhere(result.access_token);

      // Fetch user info from Supabase using the access token
      const userInfo = await this.fetchSupabaseUserInfo(authServerUrl, result.access_token);

      // Save user info to store
      await invoke('save_user_info', {
        username: userInfo.username,
        email: userInfo.email || null,
      });

      this.setAuthStatus('authenticated', userInfo);
      console.log('OAuth login successful');

      return userInfo;
    } catch (error) {
      console.error('Failed to complete OAuth login:', error);
      this.setAuthStatus('unauthenticated', null);
      throw error;
    }
  }

  /**
   * Self-hosted SSO/OAuth2 flow for the desktop app.
1   * Opens the system browser and waits for a deep link callback with the JWT.
   */
  async loginWithSelfHostedOAuth(providerPath: string, serverUrl: string): Promise<UserInfo> {
    // Generate and store nonce for CSRF protection
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('oauth_nonce', nonce);
    console.log('[Desktop AuthService] Generated OAuth nonce for CSRF protection');

    const trimmedServer = serverUrl.replace(/\/+$/, '');
    const fullUrl = providerPath.startsWith('http')
      ? providerPath
      : `${trimmedServer}${providerPath.startsWith('/') ? providerPath : `/${providerPath}`}`;
    let authUrl = fullUrl;
    try {
      const parsed = new URL(fullUrl);
      parsed.searchParams.set('tauri', '1');
      parsed.searchParams.set('nonce', nonce);
      authUrl = parsed.toString();
    } catch {
      // ignore URL parsing failures
    }

    // Open in system browser and wait for deep link callback
    if (await this.openInSystemBrowser(authUrl)) {
      return this.waitForDeepLinkCompletion(trimmedServer);
    }

    throw new Error('Unable to open system browser for SSO. Please check your system settings.');
  }

  /**
   * Wait for a deep-link event to complete self-hosted SSO after system browser OAuth
   */
  private async waitForDeepLinkCompletion(serverUrl: string): Promise<UserInfo> {
    if (!isTauri()) {
      throw new Error('Deep link authentication is only supported in Tauri desktop app.');
    }

    return new Promise<UserInfo>((resolve, reject) => {
      let completed = false;
      let unlisten: (() => void) | null = null;

      const timeoutId = window.setTimeout(() => {
        if (!completed) {
          completed = true;
          if (unlisten) unlisten();
          sessionStorage.removeItem('oauth_nonce');
          reject(new Error('SSO login timed out. Please try again.'));
        }
      }, 120_000);

      listen<string>('deep-link', async (event) => {
        const url = event.payload;
        if (!url || completed) return;
        try {
          const parsed = new URL(url);
          const hash = parsed.hash.replace(/^#/, '');
          const params = new URLSearchParams(hash);
          const type = params.get('type') || parsed.searchParams.get('type');
          const error = params.get('error') || parsed.searchParams.get('error');
          if (type === 'sso-error' || error) {
            completed = true;
            if (unlisten) unlisten();
            clearTimeout(timeoutId);
            sessionStorage.removeItem('oauth_nonce');
            reject(new Error(error || 'Authentication was not successful.'));
            return;
          }
          if (type !== 'sso' && type !== 'sso-selfhosted') {
            return;
          }
          const token = params.get('access_token') || parsed.searchParams.get('access_token');
          if (!token) {
            return;
          }

          // CSRF Protection: Validate nonce before accepting token
          const nonceFromUrl = params.get('nonce') || parsed.searchParams.get('nonce');
          const storedNonce = sessionStorage.getItem('oauth_nonce');

          if (!nonceFromUrl || !storedNonce || nonceFromUrl !== storedNonce) {
            completed = true;
            if (unlisten) unlisten();
            clearTimeout(timeoutId);
            sessionStorage.removeItem('oauth_nonce');
            console.error('[Desktop AuthService] Nonce validation failed - potential CSRF attack');
            reject(new Error('Invalid authentication state. Nonce validation failed.'));
            return;
          }

          completed = true;
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          sessionStorage.removeItem('oauth_nonce');
          console.log('[Desktop AuthService] Nonce validated successfully');

          const userInfo = await this.completeSelfHostedSession(serverUrl, token);
          // Ensure connection mode is set and backend is ready (in case caller doesn't)
          try {
            await connectionModeService.switchToSelfHosted({ url: serverUrl });
            await tauriBackendService.initializeExternalBackend();
          } catch (e) {
            console.warn('[Desktop AuthService] Failed to initialize backend after deep link:', e);
          }
          resolve(userInfo);
        } catch (err) {
          completed = true;
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          sessionStorage.removeItem('oauth_nonce');
          reject(err instanceof Error ? err : new Error('Failed to complete SSO'));
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
  }

  private async openInSystemBrowser(url: string): Promise<boolean> {
    if (!isTauri()) {
      return false;
    }
    try {
      // Prefer plugin-shell (2.x) if available
      await shellOpen(url);
      return true;
    } catch (err) {
      console.error('Failed to open system browser for SSO:', err);
      return false;
    }
  }

  /**
   * Save JWT + user info for self-hosted SSO logins
   */
  async completeSelfHostedSession(serverUrl: string, token: string): Promise<UserInfo> {
    const userInfo = await this.fetchSelfHostedUserInfo(serverUrl, token);

    await this.saveTokenEverywhere(token);
    await invoke('save_user_info', {
      username: userInfo.username,
      email: userInfo.email || null,
    });

    this.setAuthStatus('authenticated', userInfo);
    return userInfo;
  }

  private async fetchSelfHostedUserInfo(serverUrl: string, token: string): Promise<UserInfo> {
    try {
      const response = await axios.get(
        `${serverUrl.replace(/\/+$/, '')}/api/v1/auth/me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = response.data;
      const user = data.user || data;

      return {
        username: user.username || user.email || 'User',
        email: user.email || undefined,
      };
    } catch (error) {
      console.error('[Desktop AuthService] Failed to fetch user info after SSO:', error);
      throw error;
    }
  }

  /**
   * Fetch user info from Supabase using access token
   */
  private async fetchSupabaseUserInfo(authServerUrl: string, accessToken: string): Promise<UserInfo> {
    try {
      const userEndpoint = `${authServerUrl}/auth/v1/user`;

      const response = await axios.get(userEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
        },
      });

      const data = response.data;
      console.log('User info fetched:', data.email);

      return {
        username: data.user_metadata?.full_name || data.email || 'Unknown',
        email: data.email,
      };
    } catch (error) {
      console.error('Failed to fetch user info from Supabase:', error);
      // Fallback to basic info
      return {
        username: 'User',
        email: undefined,
      };
    }
  }

}

export const authService = AuthService.getInstance();
