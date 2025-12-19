import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AuthCallback from '@app/routes/AuthCallback';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('@app/auth/UseSession', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    // Reset window.location.hash
    window.location.hash = '';
    // Default mock: no session, not loading
    mockUseAuth.mockReturnValue({ session: null, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('should extract JWT from URL hash and store it', async () => {
    const mockToken = 'oauth-jwt-token';

    // Set URL hash with access token
    window.location.hash = `#access_token=${mockToken}`;

    // Mock useAuth returning loading state (validation in progress)
    mockUseAuth.mockReturnValue({ session: null, loading: true });

    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    // Advance timers to trigger the delayed tokenStored update (50ms delay)
    await vi.advanceTimersByTimeAsync(100);

    // Verify JWT was stored
    expect(localStorage.getItem('stirling_jwt')).toBe(mockToken);

    // Verify jwt-available event was dispatched
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'jwt-available' })
    );
  });

  it('should redirect to login when no access token in hash', async () => {
    // No hash or empty hash
    window.location.hash = '';

    render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    // Advance timers to trigger the delayed navigation (2000ms delay in component)
    await vi.advanceTimersByTimeAsync(2500);

    expect(mockNavigate).toHaveBeenCalledWith('/login', {
      replace: true,
      state: { error: 'OAuth login failed - no token received.' },
    });
    expect(localStorage.getItem('stirling_jwt')).toBeNull();
  });

  it('should display loading state initially', () => {
    window.location.hash = '#access_token=processing-token';

    // Mock useAuth returning loading state
    mockUseAuth.mockReturnValue({ session: null, loading: true });

    const { container } = render(
      <BrowserRouter>
        <AuthCallback />
      </BrowserRouter>
    );

    // Should show loading spinner
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(getByText('Completing authentication')).toBeInTheDocument();
  });
});
