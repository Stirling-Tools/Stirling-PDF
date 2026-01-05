// Desktop bridge stub for proprietary build
declare module '@desktop/bridge' {
  export function completeSelfHostedDeepLink(serverUrl: string): Promise<void>;
}

// Desktop authService stub for proprietary build (no-op)
declare module '@app/services/authService' {
  export interface UserInfo {
    username: string;
    email?: string;
  }

  export type AuthStatus = 'authenticated' | 'unauthenticated' | 'refreshing' | 'oauth_pending';

  export const authService: {
    localClearAuth: () => Promise<void>;
    logout: () => Promise<void>;
    login: (serverUrl: string, username: string, password: string) => Promise<UserInfo>;
    isAuthenticated: () => Promise<boolean>;
    getUserInfo: () => Promise<UserInfo | null>;
    initializeAuthState: () => Promise<void>;
    getAuthToken: () => Promise<string | null>;
    refreshToken: (serverUrl: string) => Promise<boolean>;
    loginWithOAuth: (
      provider: string,
      authServerUrl: string,
      successHtml: string,
      errorHtml: string
    ) => Promise<UserInfo>;
    loginWithSelfHostedOAuth: (providerPath: string, serverUrl: string) => Promise<UserInfo>;
    completeSelfHostedSession: (serverUrl: string, token: string) => Promise<UserInfo>;
    completeSupabaseSession: (accessToken: string, serverUrl: string) => Promise<UserInfo>;
    signUpSaas: (email: string, password: string) => Promise<void>;
  };
}
