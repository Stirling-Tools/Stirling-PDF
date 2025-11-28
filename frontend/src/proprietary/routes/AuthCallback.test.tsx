import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AuthCallback from '@app/routes/AuthCallback';
import { springAuth } from '@app/auth/springAuthClient';

// Mock springAuth
vi.mock('@app/auth/springAuthClient', () => ({
  springAuth: {
    getSession: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AuthCallback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Reset window.location.hash
    window.location.hash = '';
  });

  it('should extract JWT from URL hash and validate it', async () => {
    const mockToken = 'oauth-jwt-token';
    const mockUser = {
      id: '123',
      email: 'oauth@example.com',
      username: 'oauthuser',
      role: 'USER',
    };

    // Set URL hash with access token
    window.location.hash = `#access_token=${mockToken}`;

    // Mock successful session validation
    vi.mocked(springAuth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: mockUser,
          access_token: mockToken,
          expires_in: 3600,
          expires_at: Date.now() + 3600000,
        },
      },
      error: null,
    });

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Verify JWT was stored
      expect(localStorage.getItem('stirling_jwt')).toBe(mockToken);

      // Verify jwt-available event was dispatched
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'jwt-available' })
      );

      // Verify getSession was called to validate token
      expect(springAuth.getSession).toHaveBeenCalled();

      // Verify navigation to home
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should redirect to login when no access token in hash', async () => {
    // No hash or empty hash
    window.location.hash = '';

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: { error: 'OAuth login failed - no token received.' },
      });
      expect(localStorage.getItem('stirling_jwt')).toBeNull();
    });
  });

  it('should redirect to login when token validation fails', async () => {
    const invalidToken = 'invalid-oauth-token';
    window.location.hash = `#access_token=${invalidToken}`;

    // Mock failed session validation
    vi.mocked(springAuth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid token' },
    });

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      // JWT should be stored initially
      expect(localStorage.getItem('stirling_jwt')).toBeNull(); // Cleared after validation failure

      // Verify redirect to login
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: { error: 'OAuth login failed - invalid token.' },
      });
    });
  });

  it('should handle errors gracefully', async () => {
    const mockToken = 'error-token';
    window.location.hash = `#access_token=${mockToken}`;

    // Mock getSession throwing error
    vi.mocked(springAuth.getSession).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: { error: 'OAuth login failed. Please try again.' },
      });
    });
  });

  it('should display loading state while processing', () => {
    window.location.hash = '#access_token=processing-token';

    vi.mocked(springAuth.getSession).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { session: null },
                error: { message: 'Token expired' },
              }),
            100
          )
        )
    );

    const { getByText } = render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    expect(getByText('Completing authentication...')).toBeInTheDocument();
  });
});
