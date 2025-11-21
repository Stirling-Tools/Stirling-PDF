import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';

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

      // Call Rust login command (bypasses CORS)
      const response = await invoke<LoginResponse>('login', {
        serverUrl,
        username,
        password,
      });

      const { token, username: returnedUsername, email } = response;

      // Save the token to keyring
      await invoke('save_auth_token', { token });

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

      // Rust commands return string errors
      if (typeof error === 'string') {
        throw new Error(error);
      }

      throw new Error('Login failed. Please try again.');
    }
  }

  async logout(): Promise<void> {
    try {
      console.log('Logging out');

      // Clear token from keyring
      await invoke('clear_auth_token');

      // Clear user info from store
      await invoke('clear_user_info');

      this.setAuthStatus('unauthenticated', null);

      console.log('Logged out successfully');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still set status to unauthenticated even if clear fails
      this.setAuthStatus('unauthenticated', null);
    }
  }

  async getAuthToken(): Promise<string | null> {
    try {
      const token = await invoke<string | null>('get_auth_token');
      return token || null;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAuthToken();
    return token !== null;
  }

  async getUserInfo(): Promise<UserInfo | null> {
    if (this.userInfo) {
      return this.userInfo;
    }

    try {
      const userInfo = await invoke<UserInfo | null>('get_user_info');
      this.userInfo = userInfo;
      return userInfo;
    } catch (error) {
      console.error('Failed to get user info:', error);
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

      // Save the new token
      await invoke('save_auth_token', { token });

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
    const token = await this.getAuthToken();
    const userInfo = await this.getUserInfo();

    if (token && userInfo) {
      this.setAuthStatus('authenticated', userInfo);
    } else {
      this.setAuthStatus('unauthenticated', null);
    }
  }

  /**
   * Start OAuth login flow by opening system browser with deep link callback
   */
  async loginWithOAuth(provider: string, authServerUrl: string): Promise<UserInfo> {
    try {
      console.log('Starting OAuth login with provider:', provider);
      this.setAuthStatus('oauth_pending', null);

      // Import Tauri event listener
      const { listen } = await import('@tauri-apps/api/event');

      // Set up listener for OAuth callback before opening browser
      const unlisten = await listen<string>('oauth-callback', async (event) => {
        try {
          console.log('OAuth callback received via deep link:', event.payload);

          // Parse the callback URL to extract tokens
          const result = await invoke<OAuthCallbackResult>('parse_oauth_callback_url', {
            urlStr: event.payload,
          });

          console.log('Tokens extracted, storing...');

          // Save the access token to keyring
          await invoke('save_auth_token', { token: result.access_token });

          // Fetch user info from Supabase using the access token
          const userInfo = await this.fetchSupabaseUserInfo(authServerUrl, result.access_token);

          // Save user info to store
          await invoke('save_user_info', {
            username: userInfo.username,
            email: userInfo.email || null,
          });

          this.setAuthStatus('authenticated', userInfo);
          console.log('OAuth login successful');

          // Clean up listener
          unlisten();
        } catch (error) {
          console.error('Failed to process OAuth callback:', error);
          this.setAuthStatus('unauthenticated', null);
          unlisten();
          throw error;
        }
      });

      // Call Rust command to open browser
      // The callback will arrive via the oauth-callback event
      await invoke('start_oauth_login', {
        provider,
        authServerUrl,
      });

      console.log('Browser opened, waiting for OAuth callback...');

      // Return a promise that resolves when authentication completes
      // We wait for the status to change from oauth_pending
      return new Promise((resolve, reject) => {
        const checkStatus = () => {
          if (this.authStatus === 'authenticated' && this.userInfo) {
            resolve(this.userInfo);
          } else if (this.authStatus === 'unauthenticated') {
            reject(new Error('OAuth authentication failed'));
          } else {
            // Still pending, check again
            setTimeout(checkStatus, 100);
          }
        };
        checkStatus();
      });
    } catch (error) {
      console.error('Failed to start OAuth login:', error);
      this.setAuthStatus('unauthenticated', null);
      throw error;
    }
  }

  /**
   * Fetch user info from Supabase using access token
   */
  private async fetchSupabaseUserInfo(authServerUrl: string, accessToken: string): Promise<UserInfo> {
    try {
      const response = await axios.get(`${authServerUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '',
        },
      });

      const data = response.data;
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
