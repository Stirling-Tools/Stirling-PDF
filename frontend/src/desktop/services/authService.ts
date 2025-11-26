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
  private authListeners = new Set<(status: AuthStatus, userInfo: UserInfo | null) => void>();

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
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

      // Save the token to Tauri store
      try {
        await invoke('save_auth_token', { token });
        console.log('[Desktop AuthService] Token saved to Tauri store');
      } catch (error) {
        console.error('[Desktop AuthService] Failed to save token to Tauri store:', error);
        throw new Error('Failed to save authentication token');
      }

      // ALSO save to localStorage so the web auth layer (springAuth) can detect it
      localStorage.setItem('stirling_jwt', token);
      console.log('[Desktop AuthService] Token saved to localStorage');

      // Notify other parts of the system that JWT is available
      window.dispatchEvent(new CustomEvent('jwt-available'));
      console.log('[Desktop AuthService] Dispatched jwt-available event');

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

      // Clear token from Tauri store
      await invoke('clear_auth_token');

      // ALSO clear from localStorage
      localStorage.removeItem('stirling_jwt');

      // Clear user info from Tauri store
      await invoke('clear_user_info');

      this.setAuthStatus('unauthenticated', null);

      console.log('Logged out successfully');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still set status to unauthenticated even if clear fails
      this.setAuthStatus('unauthenticated', null);
      // Still try to clear localStorage even if keyring clear failed
      localStorage.removeItem('stirling_jwt');
    }
  }

  async getAuthToken(): Promise<string | null> {
    try {
      console.log('[Desktop AuthService] Retrieving token from Tauri store...');
      const token = await invoke<string | null>('get_auth_token');
      if (token) {
        console.log('[Desktop AuthService] Token found in Tauri store (length:', token.length, ')');
      } else {
        console.log('[Desktop AuthService] No token in Tauri store');
      }
      return token || null;
    } catch (error) {
      console.error('[Desktop AuthService] Failed to get auth token from Tauri store:', error);
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

      // Save the new token to Tauri store
      await invoke('save_auth_token', { token });

      // ALSO update localStorage
      localStorage.setItem('stirling_jwt', token);

      // Notify other parts of the system that JWT is available
      window.dispatchEvent(new CustomEvent('jwt-available'));

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
    const existingLocalStorageToken = localStorage.getItem('stirling_jwt');

    if (token && userInfo) {
      console.log('[Desktop AuthService] Found token in Tauri store, syncing to localStorage');
      // Sync token to localStorage so web auth layer can detect it
      localStorage.setItem('stirling_jwt', token);

      // Notify other parts of the system that JWT is available
      window.dispatchEvent(new CustomEvent('jwt-available'));

      this.setAuthStatus('authenticated', userInfo);
      console.log('[Desktop AuthService] Auth state initialized as authenticated');
    } else if (!existingLocalStorageToken) {
      // Only clear localStorage if there's no token there either
      // This prevents clearing a valid token that was set by web login
      console.log('[Desktop AuthService] No token found in Tauri store or localStorage');
      localStorage.removeItem('stirling_jwt');
      this.setAuthStatus('unauthenticated', null);
      console.log('[Desktop AuthService] Auth state initialized as unauthenticated');
    } else {
      console.log('[Desktop AuthService] No token in Tauri store but found in localStorage, keeping it');
      // There's a token in localStorage but not in Tauri store
      // This can happen if user logged in via web layer
      // Keep the unauthenticated status for desktop layer but don't clear localStorage
      this.setAuthStatus('unauthenticated', null);
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

      // Save the access token to Tauri store
      await invoke('save_auth_token', { token: result.access_token });

      // ALSO save to localStorage so the web auth layer (springAuth) can detect it
      localStorage.setItem('stirling_jwt', result.access_token);

      // Notify other parts of the system that JWT is available
      window.dispatchEvent(new CustomEvent('jwt-available'));

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
