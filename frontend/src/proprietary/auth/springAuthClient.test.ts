import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { springAuth } from '@app/auth/springAuthClient';
import { startOAuthNavigation } from '@app/extensions/oauthNavigation';
import * as platformSessionBridge from '@app/extensions/platformSessionBridge';
import apiClient from '@app/services/apiClient';
import { AxiosError } from 'axios';

// Mock apiClient
vi.mock('@app/services/apiClient');
vi.mock('@app/extensions/oauthNavigation', () => ({
  startOAuthNavigation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@app/extensions/platformSessionBridge', () => ({
  isDesktopSaaSAuthMode: vi.fn().mockResolvedValue(false),
  getPlatformSessionUser: vi.fn().mockResolvedValue(null),
  refreshPlatformSession: vi.fn().mockResolvedValue(false),
}));

describe('SpringAuthClient', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getSession', () => {
    it('should return null session when no JWT in localStorage', async () => {
      const result = await springAuth.getSession();

      expect(result.data.session).toBeNull();
      expect(result.error).toBeNull();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should validate JWT and return session when JWT exists', async () => {
      const exp = Math.floor(Date.now() / 1000) + 1800;
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp, marker: 'a-b_c' })).toString('base64url');
      const mockToken = `${header}.${payload}.sig`;
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };

      localStorage.setItem('stirling_jwt', mockToken);

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        status: 200,
        data: { user: mockUser },
      } as any);

      const result = await springAuth.getSession();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${mockToken}` },
        suppressErrorToast: true,
        skipAuthRedirect: true,
      });
      expect(result.data.session).toBeTruthy();
      expect(result.data.session?.user).toEqual(mockUser);
      expect(result.data.session?.access_token).toBe(mockToken);
      expect(result.data.session?.expires_at).toBe(exp * 1000);
      expect(result.data.session?.expires_in).toBeGreaterThan(0);
      expect(result.error).toBeNull();
    });

    it('should clear token and return null session for desktop SaaS when expired refresh fails', async () => {
      const exp = Math.floor(Date.now() / 1000) - 60;
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
      const expiredToken = `${header}.${payload}.sig`;
      localStorage.setItem('stirling_jwt', expiredToken);

      vi.mocked(platformSessionBridge.isDesktopSaaSAuthMode).mockResolvedValueOnce(true);
      vi.mocked(platformSessionBridge.refreshPlatformSession).mockResolvedValueOnce(false);

      const result = await springAuth.getSession();

      expect(result.data.session).toBeNull();
      expect(result.error).toBeNull();
      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('should refresh and recover session when /auth/me returns 401', async () => {
      const staleToken = 'stale-jwt-token';
      const refreshedToken = 'fresh-jwt-token';
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };
      localStorage.setItem('stirling_jwt', staleToken);

      const authMe401 = new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 401,
          statusText: 'Unauthorized',
          data: {},
          headers: {},
          config: {} as any,
        }
      );

      vi.mocked(apiClient.get).mockRejectedValueOnce(authMe401);
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {
          user: mockUser,
          session: {
            access_token: refreshedToken,
            expires_in: 3600,
          },
        },
      } as any);

      const result = await springAuth.getSession();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        null,
        expect.objectContaining({
          withCredentials: true,
          suppressErrorToast: true,
        })
      );
      expect(localStorage.getItem('stirling_jwt')).toBe(refreshedToken);
      expect(result.data.session?.access_token).toBe(refreshedToken);
      expect(result.error).toBeNull();
    });

    it('should refresh and recover session when /auth/me returns axios-like 401 error object', async () => {
      const staleToken = 'stale-jwt-token';
      const refreshedToken = 'fresh-jwt-token';
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };
      localStorage.setItem('stirling_jwt', staleToken);

      vi.mocked(apiClient.get).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 401, data: {} },
        message: 'Unauthorized',
      });
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {
          user: mockUser,
          session: {
            access_token: refreshedToken,
            expires_in: 3600,
          },
        },
      } as any);

      const result = await springAuth.getSession();

      expect(localStorage.getItem('stirling_jwt')).toBe(refreshedToken);
      expect(result.data.session?.access_token).toBe(refreshedToken);
      expect(result.error).toBeNull();
    });

    it('should clear invalid JWT on 401 error when refresh fails', async () => {
      const mockToken = 'invalid-jwt-token';
      localStorage.setItem('stirling_jwt', mockToken);

      const mockError = new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 401,
          statusText: 'Unauthorized',
          data: {},
          headers: {},
          config: {} as any,
        }
      );

      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 401 },
        message: 'Token expired',
      });

      const result = await springAuth.getSession();

      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.data.session).toBeNull();
      // 401 is handled gracefully, so error should be null
      expect(result.error).toBeNull();
    });

    it('should clear invalid JWT on 403 error when refresh fails', async () => {
      const mockToken = 'forbidden-jwt-token';
      localStorage.setItem('stirling_jwt', mockToken);

      const mockError = new AxiosError(
        'Forbidden',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 403,
          statusText: 'Forbidden',
          data: {},
          headers: {},
          config: {} as any,
        }
      );

      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError);
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 403 },
        message: 'Forbidden',
      });

      const result = await springAuth.getSession();

      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.data.session).toBeNull();
      // 403 is handled gracefully, so error should be null
      expect(result.error).toBeNull();
    });
  });

  describe('signInWithPassword', () => {
    it('should successfully sign in with email and password', async () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockToken = 'new-jwt-token';
      const mockUser = {
        id: '123',
        email: credentials.email,
        username: credentials.email,
        role: 'USER',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {
          user: mockUser,
          session: {
            access_token: mockToken,
            expires_in: 3600,
          },
        },
      } as any);

      // Spy on window.dispatchEvent
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const result = await springAuth.signInWithPassword(credentials);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        {
          username: credentials.email,
          password: credentials.password,
        },
        { withCredentials: true }
      );
      expect(localStorage.getItem('stirling_jwt')).toBe(mockToken);
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'jwt-available' })
      );
      expect(result.user).toEqual(mockUser);
      expect(result.session?.access_token).toBe(mockToken);
      expect(result.error).toBeNull();
    });

    it('should return error on failed login', async () => {
      const credentials = {
        email: 'wrong@example.com',
        password: 'wrongpassword',
      };

      const errorMessage = 'Invalid credentials';
      const mockError = Object.assign(new Error(errorMessage), {
        isAxiosError: true,
        response: {
          status: 401,
          data: { message: errorMessage },
        },
      });

      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      const result = await springAuth.signInWithPassword(credentials);

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error?.message).toBe(errorMessage);
    });
  });

  describe('signUp', () => {
    it('should successfully register new user', async () => {
      const credentials = {
        email: 'newuser@example.com',
        password: 'newpassword123',
      };

      const mockUser = {
        id: '456',
        email: credentials.email,
        username: credentials.email,
        role: 'USER',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: { user: mockUser },
      } as any);

      const result = await springAuth.signUp(credentials);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/user/register',
        {
          username: credentials.email,
          password: credentials.password,
        },
        { withCredentials: true }
      );
      expect(result.user).toEqual(mockUser);
      expect(result.session).toBeNull(); // No auto-login on signup
      expect(result.error).toBeNull();
    });

    it('should return error on failed registration', async () => {
      const credentials = {
        email: 'existing@example.com',
        password: 'password123',
      };

      const errorMessage = 'User already exists';
      const mockError = Object.assign(new Error(errorMessage), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: errorMessage },
        },
      });

      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      const result = await springAuth.signUp(credentials);

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeTruthy();
      expect(result.error?.message).toBe(errorMessage);
    });
  });

  describe('signOut', () => {
    it('should successfully sign out and clear JWT', async () => {
      const mockToken = 'jwt-to-clear';
      localStorage.setItem('stirling_jwt', mockToken);

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {},
      } as any);

      const result = await springAuth.signOut();

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/auth/logout',
        null,
        expect.objectContaining({ withCredentials: true })
      );
      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should clear JWT even if logout request fails', async () => {
      const mockToken = 'jwt-to-clear';
      localStorage.setItem('stirling_jwt', mockToken);

      vi.mocked(apiClient.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500 },
        message: 'Server error',
      });

      const result = await springAuth.signOut();

      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe('refreshSession', () => {
    it('should refresh JWT token successfully', async () => {
      const newToken = 'refreshed-jwt-token';
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {
          user: mockUser,
          session: {
            access_token: newToken,
            expires_in: 3600,
          },
        },
      } as any);

      const result = await springAuth.refreshSession();

      expect(localStorage.getItem('stirling_jwt')).toBe(newToken);
      expect(result.data.session?.access_token).toBe(newToken);
      expect(result.error).toBeNull();
    });

    it('should clear JWT and return error on 401', async () => {
      localStorage.setItem('stirling_jwt', 'expired-token');

      vi.mocked(apiClient.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 401 },
        message: 'Token expired',
      });

      const result = await springAuth.refreshSession();

      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.data.session).toBeNull();
      expect(result.error).toBeTruthy();
    });
  });

  describe('signInWithOAuth', () => {
    it('should redirect to OAuth provider', async () => {
      const mockAssign = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { assign: mockAssign },
        writable: true,
      });

      vi.mocked(startOAuthNavigation).mockResolvedValueOnce(false);

      const result = await springAuth.signInWithOAuth({
        provider: '/oauth2/authorization/github',
        options: { redirectTo: '/auth/callback' },
      });

      expect(startOAuthNavigation).toHaveBeenCalledWith('/oauth2/authorization/github');
      expect(mockAssign).toHaveBeenCalledWith('/oauth2/authorization/github');
      expect(result.error).toBeNull();
    });

    it('should skip redirect when handled by extension', async () => {
      const mockAssign = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { assign: mockAssign },
        writable: true,
      });

      vi.mocked(startOAuthNavigation).mockResolvedValueOnce(true);

      const result = await springAuth.signInWithOAuth({
        provider: '/oauth2/authorization/github',
        options: { redirectTo: '/auth/callback' },
      });

      expect(startOAuthNavigation).toHaveBeenCalledWith('/oauth2/authorization/github');
      expect(mockAssign).not.toHaveBeenCalled();
      expect(result.error).toBeNull();
    });
  });
});
