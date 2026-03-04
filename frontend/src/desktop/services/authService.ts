import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { connectionModeService } from '@app/services/connectionModeService';
import { tauriBackendService } from '@app/services/tauriBackendService';
import axios from 'axios';
import tauriHttpClient from '@app/services/tauriHttpClient';
import { DESKTOP_DEEP_LINK_CALLBACK, STIRLING_SAAS_URL, SUPABASE_KEY } from '@app/constants/connection';

export interface UserInfo {
  username: string;
  email?: string;
}

export class AuthServiceError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
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
  private lastTokenSaveTime: number = 0;
  private authListeners = new Set<(status: AuthStatus, userInfo: UserInfo | null) => void>();
  private refreshPromise: Promise<boolean> | null = null;
  private selfHostedDeepLinkFlowActive = false;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Save token to all storage locations and notify listeners
   */
  private async saveTokenEverywhere(
    token: string,
    refreshToken?: string | null,
    emitJwtAvailable = true
  ): Promise<void> {
    // Validate token before caching
    if (!token || token.trim().length === 0) {
      console.warn('[Desktop AuthService] Attempted to save invalid/empty token');
      throw new Error('Invalid token');
    }

    // Save access token to Tauri secure store (primary)
    try {
      await invoke('save_auth_token', { token });
    } catch (error) {
      console.error('[Desktop AuthService] Failed to save token to Tauri store:', error);
      // Don't throw - we can still use localStorage
    }

    // Sync to localStorage for web layer (fallback)
    try {
      localStorage.setItem('stirling_jwt', token);
    } catch (error) {
      console.error('[Desktop AuthService] Failed to save token to localStorage:', error);
    }

    // Cache the valid token in memory
    this.cachedToken = token;
    this.lastTokenSaveTime = Date.now();

    // Save refresh token if provided (keyring with Tauri Store fallback)
    if (refreshToken) {
      try {
        await invoke('save_refresh_token', { token: refreshToken });
        // Only remove from localStorage after successful save
        localStorage.removeItem('stirling_refresh_token');
      } catch (error) {
        console.error('[Desktop AuthService] Failed to save refresh token:', error);
      }
    }

    if (emitJwtAvailable) {
      // Notify other parts of the system when a brand-new auth session is established.
      window.dispatchEvent(new CustomEvent('jwt-available'));
    }
  }

  /**
   * Get token from any available source (Tauri store or localStorage)
   */
  private async getTokenFromAnySource(): Promise<string | null> {
    // Try Tauri store first
    try {
      const token = await invoke<string | null>('get_auth_token');
      if (token) {
        return token;
      }
    } catch (error) {
      console.error('[Desktop AuthService] Failed to read from Tauri store:', error);
    }

    // Fallback to localStorage
    return localStorage.getItem('stirling_jwt');
  }

  /**
   * Get refresh token from secure storage (keyring or Tauri Store fallback)
   */
  private async getRefreshToken(): Promise<string | null> {
    return await invoke<string | null>('get_refresh_token');
  }

  /**
   * Clear token from all storage locations
   */
  private async clearTokenEverywhere(): Promise<void> {
    // Invalidate cache
    this.cachedToken = null;

    // Best effort: clear Tauri keyring (both access and refresh tokens)
    try {
      await invoke('clear_auth_token');
    } catch (error) {
      console.warn('[Desktop AuthService] Failed to clear Tauri keyring access token', error);
    }

    try {
      await invoke('clear_refresh_token');
    } catch (error) {
      console.warn('[Desktop AuthService] Failed to clear Tauri keyring refresh token', error);
    }

    // Best effort: clear web storage
    try {
      localStorage.removeItem('stirling_jwt');
      localStorage.removeItem('stirling_refresh_token');
    } catch (error) {
      console.warn('[Desktop AuthService] Failed to clear localStorage tokens', error);
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

  isSelfHostedDeepLinkFlowActive(): boolean {
    return this.selfHostedDeepLinkFlowActive;
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
        throw new Error(message || 'Sign up failed', { cause: error });
      }
      throw error instanceof Error ? error : new Error('Sign up failed', { cause: error });
    }
  }

  async login(serverUrl: string, username: string, password: string, mfaCode?: string): Promise<UserInfo> {
    try {
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
        mfaCode,
        supabaseKey: SUPABASE_KEY,
        saasServerUrl: STIRLING_SAAS_URL,
      });

      const { token, username: returnedUsername, email } = response;

      // Save token to all storage locations
      try {
        await this.saveTokenEverywhere(token);
      } catch (error) {
        console.error('[Desktop AuthService] Failed to save token:', error);
        throw new Error('Failed to save authentication token', { cause: error });
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

      return userInfo;
    } catch (error) {
      console.error('[Desktop AuthService] Login failed:', error);

      // Provide more detailed error messages based on the error type
      if (error instanceof Error || typeof error === 'string') {
        const rawMessage = typeof error === 'string' ? error : error.message;
        const errMsg = rawMessage.toLowerCase();

        if (errMsg.includes('mfa_required')) {
          this.setAuthStatus('unauthenticated', null);
          throw new AuthServiceError('Two-factor code required.', 'mfa_required');
        }

        if (errMsg.includes('invalid_mfa_code')) {
          this.setAuthStatus('unauthenticated', null);
          throw new AuthServiceError('Invalid two-factor code.', 'invalid_mfa_code');
        }

        // Authentication errors
        if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('invalid credentials')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Invalid username or password. Please check your credentials and try again.', {
            cause: error,
          });
        }
        // Server not found or unreachable
        else if (errMsg.includes('connection refused') || errMsg.includes('econnrefused')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Cannot connect to server. Please check the server URL and ensure the server is running.', {
            cause: error,
          });
        }
        // Timeout
        else if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Login request timed out. Please check your network connection and try again.', {
            cause: error,
          });
        }
        // DNS failure
        else if (errMsg.includes('getaddrinfo') || errMsg.includes('dns') || errMsg.includes('not found') || errMsg.includes('enotfound')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Cannot resolve server address. Please check the server URL is correct.', { cause: error });
        }
        // SSL/TLS errors
        else if (errMsg.includes('ssl') || errMsg.includes('tls') || errMsg.includes('certificate') || errMsg.includes('cert')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('SSL/TLS certificate error. Server may have an invalid or self-signed certificate.', {
            cause: error,
          });
        }
        // 404 - endpoint not found
        else if (errMsg.includes('404') || errMsg.includes('not found')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Login endpoint not found. Please ensure you are connecting to a valid Stirling PDF server.', {
            cause: error,
          });
        }
        // 403 - security disabled
        else if (errMsg.includes('403') || errMsg.includes('forbidden')) {
          this.setAuthStatus('unauthenticated', null);
          throw new Error('Login is not enabled on this server. Please enable security mode (DOCKER_ENABLE_SECURITY=true).', {
            cause: error,
          });
        }
      }

      // Generic error fallback
      this.setAuthStatus('unauthenticated', null);
      throw error;
    }
  }

  /**
   * Public method to save token to all storage locations
   * Called by springAuthClient after token refresh to sync Tauri store
   */
  async saveToken(token: string): Promise<void> {
    await this.saveTokenEverywhere(token, undefined, false);
  }

  async logout(): Promise<void> {
    try {
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
      // Check cached token validity before returning
      if (this.cachedToken) {
        // Use minimal leeway (5s) for cache validation to avoid excessive invalidation
        // Health checks run every 5s, so 30s leeway would cause 5-6 unnecessary cache clears
        // The 30s leeway is used elsewhere for proactive refresh before user operations
        if (this.isTokenExpiringSoon(this.cachedToken, 5)) {
          console.warn('[Desktop AuthService] ⚠️ Cached token is expired or expiring soon, invalidating cache');
          this.cachedToken = null;
          // Fall through to fetch from storage
        } else {
          console.debug('[Desktop AuthService] ✅ Returning cached token');
          return this.cachedToken;
        }
      }

      console.debug('[Desktop AuthService] Cache miss, fetching from storage...');
      const token = await this.getTokenFromAnySource();

      // Cache token if found (backend will validate expiry)
      if (token && token.trim().length > 0) {
        this.cachedToken = token;
        console.log('[Desktop AuthService] ✅ Token cached in memory after retrieval');
        return token;
      }
      return null;
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

  async awaitRefreshIfInProgress(): Promise<boolean> {
    if (!this.refreshPromise) {
      return false;
    }
    try {
      console.debug('[Desktop AuthService] Waiting for in-flight refresh to complete');
      return await this.refreshPromise;
    } catch (error) {
      console.warn('[Desktop AuthService] In-flight refresh failed while waiting', error);
      return false;
    }
  }

  isTokenExpiringSoon(token: string, leewaySeconds = 30): boolean {
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        console.warn('[Desktop AuthService] Token malformed - less than 2 parts');
        return true;
      }

      const base64Url = parts[1];
      const base64 = base64Url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
      const payload = JSON.parse(atob(base64));
      const expSeconds = typeof payload?.exp === 'number' ? payload.exp : 0;

      if (!expSeconds) {
        console.warn('[Desktop AuthService] Token has no exp claim');
        return true;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const nowWithLeeway = nowSeconds + Math.max(0, leewaySeconds);
      const timeUntilExpiry = expSeconds - nowSeconds;
      const isExpiring = expSeconds <= nowWithLeeway;

      console.debug('[Desktop AuthService] Token expiry check:', {
        expiresIn: timeUntilExpiry + 's',
        leeway: leewaySeconds + 's',
        isExpiring
      });

      return isExpiring;
    } catch (err) {
      // If parsing fails, treat token as unsafe/stale and force refresh path.
      console.warn('[Desktop AuthService] Token parsing failed:', err);
      return true;
    }
  }

  async refreshToken(serverUrl: string): Promise<boolean> {
    // Prevent concurrent refresh attempts - reuse in-flight refresh
    if (this.refreshPromise) {
      console.log('[Desktop AuthService] Refresh already in progress, awaiting existing refresh');
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefreshToken(serverUrl);
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefreshToken(serverUrl: string): Promise<boolean> {
    try {
      console.log('[Desktop AuthService] Refreshing auth token');
      this.setAuthStatus('refreshing', this.userInfo);

      const currentToken = await this.getAuthToken();
      if (!currentToken) {
        this.setAuthStatus('unauthenticated', null);
        return false;
      }

      // Call the server's refresh endpoint using Tauri HTTP client so the desktop
      // User-Agent is sent - the backend uses it to issue long-lived desktop tokens.
      const response = await tauriHttpClient.post(
        `${serverUrl}/api/v1/auth/refresh`,
        {},
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }
      );

      const token =
        response.data?.session?.access_token ??
        response.data?.access_token ??
        response.data?.token;

      if (!token) {
        console.error('[Desktop AuthService] Refresh response missing token payload');
        this.setAuthStatus('unauthenticated', null);
        await this.logout();
        return false;
      }

      // Save token to all storage locations
      await this.saveTokenEverywhere(token, undefined, false);

      const userInfo = await this.getUserInfo();
      this.setAuthStatus('authenticated', userInfo);

      console.log('[Desktop AuthService] Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Desktop AuthService] Token refresh failed:', error);
      this.setAuthStatus('unauthenticated', null);

      // Clear stored credentials on refresh failure
      await this.logout();

      return false;
    }
  }

  async refreshSupabaseToken(authServerUrl: string): Promise<boolean> {
    // Prevent concurrent refresh attempts - reuse in-flight refresh
    if (this.refreshPromise) {
      console.log('[Desktop AuthService] Refresh already in progress, awaiting existing refresh');
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefreshSupabaseToken(authServerUrl);
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefreshSupabaseToken(authServerUrl: string): Promise<boolean> {
    try {
      console.log('[Desktop AuthService] Refreshing Supabase token');
      this.setAuthStatus('refreshing', this.userInfo);

      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        console.error('[Desktop AuthService] No refresh token available');
        this.setAuthStatus('unauthenticated', null);
        return false;
      }

      // Call Supabase refresh endpoint
      const response = await axios.post(
        `${authServerUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          refresh_token: refreshToken,
        },
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      const { access_token, refresh_token: newRefreshToken } = response.data;

      // Save new tokens
      await this.saveTokenEverywhere(access_token, newRefreshToken, false);

      const userInfo = await this.getUserInfo();
      this.setAuthStatus('authenticated', userInfo);

      console.log('[Desktop AuthService] Supabase token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Desktop AuthService] Supabase token refresh failed:', error);
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
      // Check if token exists in storage (user just logged in via web flow)
      const tokenInStorage = typeof window !== 'undefined' ? localStorage.getItem('stirling_jwt') : null;
      if (tokenInStorage) {
        console.log('[Desktop AuthService] On login/setup path with token present - skipping validation');
        console.log('[Desktop AuthService] Login flow will handle authentication state');
        // Return early to avoid clearing partial state during login completion
        // The login completion handler (completeSelfHostedSession) will:
        // 1. Fetch and save user info
        // 2. Set auth status to authenticated
        return;
      } else {
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
    }

    const token = await this.getAuthToken();
    const userInfo = await this.getUserInfo();

    if (token && userInfo) {
      console.log('[Desktop AuthService] Found existing token and user info');
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
      console.log('[Desktop AuthService] Starting OAuth login with provider:', provider);
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

      console.log('[Desktop AuthService] OAuth authentication successful, storing tokens');
      console.log('[Desktop AuthService] OAuth result - has access_token:', !!result.access_token);
      console.log('[Desktop AuthService] OAuth result - has refresh_token:', !!result.refresh_token);
      console.log('[Desktop AuthService] OAuth result - expires_in:', result.expires_in);

      // Save token and refresh token to all storage locations
      await this.saveTokenEverywhere(result.access_token, result.refresh_token);

      // Fetch user info from Supabase using the access token
      const userInfo = await this.fetchSupabaseUserInfo(authServerUrl, result.access_token);

      // Save user info to store
      await invoke('save_user_info', {
        username: userInfo.username,
        email: userInfo.email || null,
      });

      this.setAuthStatus('authenticated', userInfo);
      console.log('[Desktop AuthService] OAuth login successful');

      return userInfo;
    } catch (error) {
      console.error('[Desktop AuthService] Failed to complete OAuth login:', error);
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

    // Register deep-link listener before opening browser to avoid callback races on first launch.
    return this.waitForDeepLinkCompletion(trimmedServer, async () => {
      if (!(await this.openInSystemBrowser(authUrl))) {
        throw new Error('Unable to open system browser for SSO. Please check your system settings.');
      }
    });
  }

  /**
   * Wait for a deep-link event to complete self-hosted SSO after system browser OAuth
   */
  private async waitForDeepLinkCompletion(
    serverUrl: string,
    startFlow?: () => Promise<void>
  ): Promise<UserInfo> {
    if (!isTauri()) {
      throw new Error('Deep link authentication is only supported in Tauri desktop app.');
    }

    this.selfHostedDeepLinkFlowActive = true;

    return new Promise<UserInfo>((resolve, reject) => {
      let completed = false;
      let unlisten: (() => void) | null = null;

      const timeoutId = window.setTimeout(() => {
        if (!completed) {
          completed = true;
          if (unlisten) unlisten();
          sessionStorage.removeItem('oauth_nonce');
          this.selfHostedDeepLinkFlowActive = false;
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
            this.selfHostedDeepLinkFlowActive = false;
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
            this.selfHostedDeepLinkFlowActive = false;
            console.error('[Desktop AuthService] Nonce validation failed - potential CSRF attack');
            reject(new Error('Invalid authentication state. Nonce validation failed.'));
            return;
          }

          completed = true;
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          sessionStorage.removeItem('oauth_nonce');
          this.selfHostedDeepLinkFlowActive = false;
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
          this.selfHostedDeepLinkFlowActive = false;
          reject(err instanceof Error ? err : new Error('Failed to complete SSO'));
        }
      }).then(async (fn) => {
        unlisten = fn;

        if (!startFlow || completed) {
          return;
        }

        try {
          await startFlow();
        } catch (err) {
          if (completed) {
            return;
          }
          completed = true;
          if (unlisten) unlisten();
          clearTimeout(timeoutId);
          sessionStorage.removeItem('oauth_nonce');
          this.selfHostedDeepLinkFlowActive = false;
          reject(err instanceof Error ? err : new Error('Failed to start SSO login'));
        }
      }).catch((err) => {
        if (completed) {
          return;
        }
        completed = true;
        if (unlisten) unlisten();
        clearTimeout(timeoutId);
        sessionStorage.removeItem('oauth_nonce');
        this.selfHostedDeepLinkFlowActive = false;
        reject(err instanceof Error ? err : new Error('Failed to listen for deep link events'));
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
