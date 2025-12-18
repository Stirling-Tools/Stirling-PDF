import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import { resetOAuthState } from '@proprietary/auth/oauthStorage';
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

        if (serverUrl) {
          const base = serverUrl.replace(/\/+$/, '');
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          await axios
            .post(`${base}/api/v1/auth/logout`, null, { headers, withCredentials: true })
            .catch((err) => {
              console.warn('[Desktop AuthService] Backend logout failed via /api/v1/auth/logout', err);
            });

          // Also attempt framework logout endpoint to clear cookies/sessions
          await axios.post(`${base}/logout`, null, { withCredentials: true }).catch(() => {});
        }
      } catch (err) {
        console.warn('[Desktop AuthService] Failed to call backend logout endpoint', err);
      }

      // Clear any cookies the backend may have set (e.g., refresh/session)
      try {
        document.cookie.split(';').forEach(cookie => {
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          }
        });
      } catch (err) {
        console.warn('[Desktop AuthService] Failed to clear cookies during logout', err);
      }

      // Clear token from all storage locations
      await this.clearTokenEverywhere();

      // Clear any Supabase auth tokens that may persist in localStorage
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('sb-') || key.includes('supabase'))
          .forEach((key) => localStorage.removeItem(key));

        // Clear any stored OAuth redirect state (used by SaaS auth)
        try {
          resetOAuthState();
        } catch (err) {
          console.warn('[Desktop AuthService] Failed to clear OAuth redirect state', err);
        }
      } catch (error) {
        console.warn('[Desktop AuthService] Failed to clear Supabase tokens', error);
      }

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
   * Opens a popup to the server's auth endpoint and listens for the AuthCallback page
   * to postMessage the JWT back to the main window.
   */
  async loginWithSelfHostedOAuth(providerPath: string, serverUrl: string): Promise<UserInfo> {
    const trimmedServer = serverUrl.replace(/\/+$/, '');
    const baseUrl = providerPath.startsWith('http')
      ? providerPath
      : `${trimmedServer}${providerPath.startsWith('/') ? providerPath : `/${providerPath}`}`;

    // Force account chooser like SaaS: add prompt=select_account (and max_age=0 to force re-auth)
    const urlObj = new URL(baseUrl, trimmedServer);
    urlObj.searchParams.set('prompt', 'select_account');
    urlObj.searchParams.set('max_age', '0');

    // Ensure any provider-specific "login_hint" or session cookies are ignored by requiring explicit approval
    urlObj.searchParams.set('approval_prompt', 'force'); // for older OAuth providers
    urlObj.searchParams.set('access_type', 'offline'); // common param, sometimes influences prompt behavior

    // Break Keycloak/Okta/Google session by adding a random state to defeat cached redirect
    urlObj.searchParams.set('state', `${crypto.randomUUID?.() ?? Date.now().toString(36)}-desktop`);

    // For Google specifically, be extra aggressive about forcing the chooser/consent
    const isGoogle = providerPath.toLowerCase().includes('google');
    if (isGoogle) {
      urlObj.searchParams.set('prompt', 'select_account consent');
      urlObj.searchParams.set('include_granted_scopes', 'false');
      urlObj.searchParams.delete('login_hint');
      urlObj.searchParams.set('authuser', '-1'); // tell Google to show account selector
    }

    const fullUrl = urlObj.toString();

    // Ensure backend redirects back to /auth/callback
    try {
      document.cookie = `stirling_redirect_path=${encodeURIComponent('/auth/callback')}; path=/; max-age=300; SameSite=Lax`;
    } catch {
      // ignore cookie errors
    }

    // Force a real popup so the main webview stays on the app
    let authWindow: Window | null = null;
    const popupName = `stirling-desktop-sso-${Date.now()}`;

    if (isGoogle) {
      // Hit the Google AccountChooser directly with prompt=select_account and continue to our OAuth URL
      const googleAccountChooser = `https://accounts.google.com/AccountChooser?prompt=select_account&continue=${encodeURIComponent(fullUrl)}`;
      authWindow = window.open(googleAccountChooser, popupName, 'width=900,height=900');
      // Fallback: if navigation fails, push to OAuth URL shortly after
      setTimeout(() => {
        try {
          if (authWindow && !authWindow.closed) {
            authWindow.location.assign(fullUrl);
          }
        } catch (err) {
          console.warn('Failed to navigate Google popup to OAuth URL', err);
        }
      }, 1500);
    } else {
      authWindow = window.open(fullUrl, popupName, 'width=900,height=900');
    }

    // Fallback: use Tauri shell.open and wait for deep link back
    if (!authWindow) {
      if (await this.openInSystemBrowser(fullUrl)) {
        return this.waitForDeepLinkCompletion(trimmedServer);
      }
      throw new Error('Unable to open browser window for SSO. Please allow pop-ups and try again.');
    }

    const expectedOrigin = new URL(fullUrl).origin;

    // Always also listen for deep link completion in case the opener messaging path fails
    const deepLinkPromise = this.waitForDeepLinkCompletion(trimmedServer).catch((err) => {
      console.warn('[Desktop AuthService] Deep link completion failed or timed out:', err);
      return null;
    });

    return new Promise<UserInfo>((resolve, reject) => {
      let completed = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        clearInterval(windowCheck);
        clearInterval(localTokenCheck);
        clearTimeout(timeoutId);
      };

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== expectedOrigin) {
          return;
        }

        const data = event.data as { type?: string; token?: string; access_token?: string };
        if (!data || data.type !== 'stirling-desktop-sso') {
          return;
        }

        const token = data.token || data.access_token;
        if (!token) {
          cleanup();
          reject(new Error('No token returned from SSO'));
          return;
        }

        completed = true;
        cleanup();

        try {
          const userInfo = await this.completeSelfHostedSession(trimmedServer, token);
          try {
            authWindow.close();
          } catch (closeError) {
            console.warn('Could not close auth window:', closeError);
          }
          resolve(userInfo);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to complete login'));
        }
      };

      // If deep link finishes first, resolve
      deepLinkPromise.then(async (dlResult) => {
        if (completed || !dlResult) return;
        completed = true;
        cleanup();
        resolve(dlResult);
      }).catch(() => {
        // ignore deep link errors here
      });

      window.addEventListener('message', handleMessage);

      const windowCheck = window.setInterval(() => {
        if (authWindow.closed && !completed) {
          cleanup();
          reject(new Error('Authentication window was closed before completion'));
        }
      }, 500);

      const localTokenCheck = window.setInterval(async () => {
        if (completed) {
          clearInterval(localTokenCheck);
          return;
        }
        const token = localStorage.getItem('stirling_jwt');
        if (token) {
          completed = true;
          cleanup();
          try {
            const userInfo = await this.completeSelfHostedSession(trimmedServer, token);
            try {
              authWindow.close();
            } catch (_) {
              // ignore close errors
            }
            resolve(userInfo);
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Failed to complete login'));
          }
        }
      }, 1000);

      const timeoutId = window.setTimeout(() => {
        if (!completed) {
          cleanup();
          try {
            authWindow.close();
          } catch {
            // ignore close errors
          }
          reject(new Error('SSO login timed out. Please try again.'));
        }
      }, 120_000);
    });
  }

  /**
   * Wait for a deep-link event to complete self-hosted SSO (used when popup cannot open)
   */
  private async waitForDeepLinkCompletion(serverUrl: string): Promise<UserInfo> {
    if (!isTauri()) {
      throw new Error('Unable to open browser window for SSO. Please allow pop-ups and try again.');
    }

    return new Promise<UserInfo>((resolve, reject) => {
      let completed = false;
      let unlisten: (() => void) | null = null;

      const timeoutId = window.setTimeout(() => {
        if (!completed) {
          if (unlisten) unlisten();
          reject(new Error('SSO login timed out. Please try again.'));
        }
      }, 120_000);

      const localPollId = window.setInterval(async () => {
        if (completed) {
          window.clearInterval(localPollId);
          return;
        }
        const token = localStorage.getItem('stirling_jwt');
        if (token) {
          completed = true;
          window.clearInterval(localPollId);
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          try {
            const userInfo = await this.completeSelfHostedSession(serverUrl, token);
            await connectionModeService.switchToSelfHosted({ url: serverUrl });
            await tauriBackendService.initializeExternalBackend();
            resolve(userInfo);
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Failed to complete SSO'));
          }
        }
      }, 1000);

      listen<string>('deep-link', async (event) => {
        const url = event.payload;
        if (!url || completed) return;
        try {
          const parsed = new URL(url);
          const hash = parsed.hash.replace(/^#/, '');
          const params = new URLSearchParams(hash);
          const type = params.get('type') || parsed.searchParams.get('type');
          if (type !== 'sso' && type !== 'sso-selfhosted') {
            return;
          }
          const token = params.get('access_token') || parsed.searchParams.get('access_token');
          if (!token) {
            return;
          }

          completed = true;
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          window.clearInterval(localPollId);

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
          window.clearInterval(localPollId);
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
    await this.saveTokenEverywhere(token);

    const userInfo = await this.fetchSelfHostedUserInfo(serverUrl, token);

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
      return {
        username: 'User',
        email: undefined,
      };
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
