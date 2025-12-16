import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import { STIRLING_SAAS_URL, SUPABASE_KEY } from '@app/constants/connection';

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

    // Keep auth status in sync if we already have user info
    if (this.userInfo) {
      this.setAuthStatus('authenticated', this.userInfo);
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
   * Apply a JWT obtained from an external flow (e.g., browser SSO).
   */
  async applyExternalToken(token: string, userInfo?: UserInfo | null): Promise<void> {
    await this.saveTokenEverywhere(token);

    if (userInfo) {
      this.userInfo = userInfo;
    }

    this.setAuthStatus('authenticated', userInfo ?? this.userInfo);
  }

  /**
   * Clear token from all storage locations
   */
  private async clearTokenEverywhere(): Promise<void> {
    // Invalidate cache
    this.cachedToken = null;
    console.log('[Desktop AuthService] Cache invalidated');

    await invoke('clear_auth_token');
    localStorage.removeItem('stirling_jwt');
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
