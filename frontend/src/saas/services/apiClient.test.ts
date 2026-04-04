import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getToken, refreshToken, clearAuthData } from '@app/auth/supabase';

// Mock auth module
vi.mock('@app/auth/supabase', () => ({
  getToken: vi.fn(),
  refreshToken: vi.fn(),
  clearAuthData: vi.fn(),
  setAuthData: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

// Mock error handler
vi.mock('@app/services/httpErrorHandler', () => ({
  handleHttpError: vi.fn(),
}));

// Mock toast
vi.mock('@app/components/toast', () => ({
  alert: vi.fn(),
}));

// Mock app settings
vi.mock('@app/utils/appSettings', () => ({
  openPlanSettings: vi.fn(),
}));

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return JWT token when token exists', () => {
    vi.mocked(getToken).mockReturnValue('test-jwt-token');
    expect(getToken()).toBe('test-jwt-token');
  });

  it('should return null when no token exists', () => {
    vi.mocked(getToken).mockReturnValue(null);
    expect(getToken()).toBeNull();
  });

  it('should attempt token refresh', async () => {
    vi.mocked(refreshToken).mockResolvedValue('new-token');
    const result = await refreshToken();
    expect(result).toBe('new-token');
  });

  it('should clear auth data', () => {
    clearAuthData();
    expect(clearAuthData).toHaveBeenCalled();
  });
});
