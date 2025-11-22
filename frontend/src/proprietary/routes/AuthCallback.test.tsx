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
    vi.clearAllMocks();
  });

  it('should validate session and redirect to home on successful OAuth', async () => {
    const mockUser = {
      id: '123',
      email: 'oauth@example.com',
      username: 'oauthuser',
      role: 'USER',
    };

    // JWT is in HttpOnly cookie - just validate session
    vi.mocked(springAuth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: mockUser,
          expires_in: 3600,
          expires_at: Date.now() + 3600000,
        },
      },
      error: null,
    });

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Verify getSession was called to validate cookie
      expect(springAuth.getSession).toHaveBeenCalled();

      // Verify navigation to home
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should redirect to login when session validation fails', async () => {
    // Mock failed session validation
    vi.mocked(springAuth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid session' },
    });

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      // Verify redirect to login
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: { error: 'OAuth login failed.' },
      });
    });
  });

  it('should redirect to login when no session exists', async () => {
    // Mock no session
    vi.mocked(springAuth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        replace: true,
        state: { error: 'OAuth login failed.' },
      });
    });
  });

  it('should handle errors gracefully', async () => {
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
    vi.mocked(springAuth.getSession).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { session: null },
                error: { message: 'Session expired' },
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
