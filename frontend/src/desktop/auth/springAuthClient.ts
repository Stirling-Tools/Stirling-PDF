/**
 * Desktop-specific Spring Auth Client override
 *
 * Desktop app uses its own authService for both SaaS (Supabase) and
 * self-hosted (Spring Boot) authentication. This file provides a no-op
 * implementation to prevent Spring Boot auth calls in desktop mode.
 */

import type {
  Session,
  AuthError,
  AuthResponse,
  AuthChangeCallback,
} from '@app/auth/types';

/**
 * Desktop Spring Auth Client - No-op implementation
 * Desktop app handles auth via authService.ts
 */
class SpringAuthClient {
  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    console.debug('[Desktop SpringAuth] getSession called - desktop uses authService');
    return { data: { session: null }, error: null };
  }

  async signInWithPassword(_credentials: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    console.debug('[Desktop SpringAuth] signInWithPassword called - use desktop authService.login()');
    return {
      user: null,
      session: null,
      error: { message: 'Desktop mode - use authService.login()' },
    };
  }

  async signUp(_credentials: {
    email: string;
    password: string;
    options?: { data?: { full_name?: string }; emailRedirectTo?: string };
  }): Promise<AuthResponse> {
    console.debug('[Desktop SpringAuth] signUp called - not supported in desktop mode');
    return {
      user: null,
      session: null,
      error: { message: 'Sign up not supported in desktop mode' },
    };
  }

  async signInWithOAuth(_params: {
    provider: 'github' | 'google' | 'apple' | 'azure' | 'keycloak' | 'oidc';
    options?: { redirectTo?: string; queryParams?: Record<string, any> };
  }): Promise<{ error: AuthError | null }> {
    console.debug('[Desktop SpringAuth] signInWithOAuth called - use desktop authService.loginWithOAuth()');
    return {
      error: { message: 'Desktop mode - use authService.loginWithOAuth()' },
    };
  }

  async signOut(): Promise<{ error: AuthError | null }> {
    console.debug('[Desktop SpringAuth] signOut called - use desktop authService.logout()');
    return { error: null };
  }

  async refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    console.debug('[Desktop SpringAuth] refreshSession called - use desktop authService.refreshToken()');
    return { data: { session: null }, error: null };
  }

  onAuthStateChange(_callback: AuthChangeCallback): { data: { subscription: { unsubscribe: () => void } } } {
    console.debug('[Desktop SpringAuth] onAuthStateChange called - desktop manages auth via authService');
    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  }

  destroy() {
    // No-op
  }
}

export const springAuth = new SpringAuthClient();

/**
 * Get current user - No-op in desktop mode
 */
export const getCurrentUser = async () => {
  console.debug('[Desktop SpringAuth] getCurrentUser called - desktop uses authService.getUserInfo()');
  return null;
};

export default springAuth;
