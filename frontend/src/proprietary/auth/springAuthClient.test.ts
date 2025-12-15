import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { springAuth } from '@app/auth/springAuthClient';
import apiClient from '@app/services/apiClient';
import { AxiosError } from 'axios';

// Mock apiClient
vi.mock('@app/services/apiClient');

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
      const mockToken = 'mock-jwt-token';
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
      });
      expect(result.data.session).toBeTruthy();
      expect(result.data.session?.user).toEqual(mockUser);
      expect(result.data.session?.access_token).toBe(mockToken);
      expect(result.error).toBeNull();
    });

    it('should clear invalid JWT on 401 error', async () => {
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

      const result = await springAuth.getSession();

      expect(localStorage.getItem('stirling_jwt')).toBeNull();
      expect(result.data.session).toBeNull();
      // 401 is handled gracefully, so error should be null
      expect(result.error).toBeNull();
    });

    it('should clear invalid JWT on 403 error', async () => {
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

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const result = await springAuth.refreshSession();

      expect(localStorage.getItem('stirling_jwt')).toBe(newToken);
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'jwt-available' })
      );
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

      const result = await springAuth.signInWithOAuth({
        provider: '/oauth2/authorization/github',
        options: { redirectTo: '/auth/callback' },
      });

      expect(mockAssign).toHaveBeenCalledWith('/oauth2/authorization/github');
      expect(result.error).toBeNull();
    });
  });
});
