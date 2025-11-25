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
    it('should return null session when not authenticated', async () => {
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

      expect(result.data.session).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should validate session and return user when JWT cookie exists', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };

      // JWT is in HttpOnly cookie - backend reads it automatically
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        status: 200,
        data: { user: mockUser },
      } as any);

      const result = await springAuth.getSession();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/auth/me', {
        withCredentials: true,
        suppressErrorToast: true,
      });
      expect(result.data.session).toBeTruthy();
      expect(result.data.session?.user).toEqual(mockUser);
      expect(result.data.session?.expires_in).toBe(21600);
      expect(result.error).toBeNull();
    });

    it('should return null session on 401 error', async () => {
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

      expect(result.data.session).toBeNull();
      // 401 is handled gracefully, so error should be null
      expect(result.error).toBeNull();
    });

    it('should return null session on 403 error', async () => {
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

      const mockUser = {
        id: '123',
        email: credentials.email,
        username: credentials.email,
        role: 'USER',
      };

      // JWT is now in HttpOnly cookie - no token in response body
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {
          user: mockUser,
        },
      } as any);

      const result = await springAuth.signInWithPassword(credentials);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/auth/login',
        {
          username: credentials.email,
          password: credentials.password,
        },
        { withCredentials: true }
      );
      expect(result.user).toEqual(mockUser);
      expect(result.session?.user).toEqual(mockUser);
      expect(result.session?.expires_in).toBe(21600);
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
    it('should successfully sign out', async () => {
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
      expect(result.error).toBeNull();
    });

    it('should return error if logout request fails', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 500 },
        message: 'Server error',
      });

      const result = await springAuth.signOut();

      expect(result.error).toBeTruthy();
    });
  });

  describe('refreshSession', () => {
    it('should refresh JWT token successfully', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      };

      // JWT is refreshed in HttpOnly cookie by server
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        status: 200,
        data: {},
      } as any);

      // Mock getSession call after refresh
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        status: 200,
        data: { user: mockUser },
      } as any);

      const result = await springAuth.refreshSession();

      expect(result.data.session?.user).toEqual(mockUser);
      expect(result.data.session?.expires_in).toBe(21600);
      expect(result.error).toBeNull();
    });

    it('should return error on 401', async () => {
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

      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError);

      const result = await springAuth.refreshSession();

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
        provider: 'github',
        options: { redirectTo: '/auth/callback' },
      });

      expect(mockAssign).toHaveBeenCalledWith('/oauth2/authorization/github');
      expect(result.error).toBeNull();
    });
  });
});
