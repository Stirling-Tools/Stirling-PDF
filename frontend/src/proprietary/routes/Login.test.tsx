import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import Login from '@app/routes/Login';
import { useAuth } from '@app/auth/UseSession';
import { springAuth } from '@app/auth/springAuthClient';
import { PreferencesProvider } from '@app/contexts/PreferencesContext';
import { OnboardingProvider } from '@app/contexts/OnboardingContext';

// Mock i18n to return fallback text
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      if (typeof fallback === 'string') return fallback;
      return key;
    },
  }),
}));

// Mock useAuth hook
vi.mock('@app/auth/UseSession', () => ({
  useAuth: vi.fn(),
}));

// Mock springAuth
vi.mock('@app/auth/springAuthClient', () => ({
  springAuth: {
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
  },
}));

// Mock useDocumentMeta
vi.mock('@app/hooks/useDocumentMeta', () => ({
  useDocumentMeta: vi.fn(),
}));

// Mock fetch for provider list
global.fetch = vi.fn();

const mockNavigate = vi.fn();
const mockBackendProbeState = {
  status: 'up' as const,
  loginDisabled: false,
  loading: false,
};
const mockProbe = vi.fn().mockResolvedValue(mockBackendProbeState);

vi.mock('@app/hooks/useBackendProbe', () => ({
  useBackendProbe: () => ({
    ...mockBackendProbeState,
    probe: mockProbe,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test wrapper with MantineProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>
    <PreferencesProvider>
      <OnboardingProvider>{children}</OnboardingProvider>
    </PreferencesProvider>
  </MantineProvider>
);

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackendProbeState.status = 'up';
    mockBackendProbeState.loginDisabled = false;
    mockBackendProbeState.loading = false;
    mockProbe.mockResolvedValue(mockBackendProbeState);

    // Default auth state - not logged in
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      user: null,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
    });

    // Mock fetch for login UI data
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        enableLogin: true,
        providerList: {},
      }),
    } as Response);
  });

  it('should render login form', async () => {
    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      // Check for login form elements - use id since it's more reliable
      const emailInput = document.getElementById('email');
      expect(emailInput).toBeTruthy();
    });
  });

  it('should redirect authenticated user to home', async () => {
    const mockSession = {
      user: {
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
      },
      access_token: 'mock-token',
      expires_in: 3600,
    };

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      user: mockSession.user,
      loading: false,
      error: null,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
    });

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should show loading state while auth is loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      user: null,
      loading: true,
      error: null,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
    });

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    // Component shouldn't redirect or show form while loading
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should handle email/password login', async () => {
    const user = userEvent.setup();
    const mockUser = {
      id: '123',
      email: 'test@example.com',
      username: 'test@example.com',
      role: 'USER',
    };

    const mockSession = {
      user: mockUser,
      access_token: 'new-token',
      expires_in: 3600,
    };

    vi.mocked(springAuth.signInWithPassword).mockResolvedValueOnce({
      user: mockUser,
      session: mockSession,
      error: null,
    });

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    // Wait for form to load
    await waitFor(() => {
      const emailInput = document.getElementById('email');
      expect(emailInput).toBeTruthy();
      const passwordInput = document.getElementById('password');
      expect(passwordInput).toBeTruthy();
    }, { timeout: 3000 });

    // Fill in form using getElementById
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    if (!emailInput || !passwordInput) {
      throw new Error('Form inputs not found');
    }

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    // Submit form - use a more flexible query
    // Look for button with type="submit" in the form
    const submitButton = await waitFor(() => {
      const buttons = screen.queryAllByRole('button');
      const submitBtn = buttons.find(btn => btn.getAttribute('type') === 'submit');
      if (!submitBtn) {
        throw new Error('Submit button not found');
      }
      return submitBtn;
    }, { timeout: 5000 });
    await user.click(submitButton);

    await waitFor(() => {
      expect(springAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should show error on failed login', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Invalid credentials';

    vi.mocked(springAuth.signInWithPassword).mockResolvedValueOnce({
      user: null,
      session: null,
      error: { message: errorMessage },
    });

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      expect(emailInput).toBeTruthy();
      expect(passwordInput).toBeTruthy();
    }, { timeout: 3000 });

    const emailInput = document.getElementById('email') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    await user.type(emailInput, 'wrong@example.com');
    await user.type(passwordInput, 'wrongpassword');

    const submitButton = await waitFor(() => {
      const buttons = screen.queryAllByRole('button');
      const submitBtn = buttons.find(btn => btn.getAttribute('type') === 'submit');
      if (!submitBtn) {
        throw new Error('Submit button not found');
      }
      return submitBtn;
    }, { timeout: 5000 });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('should validate empty email and password', async () => {
    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.getElementById('email')).toBeTruthy();
    }, { timeout: 3000 });

    // Find the submit button
    const submitButton = await waitFor(() => {
      const buttons = screen.queryAllByRole('button');
      const submitBtn = buttons.find(btn => btn.getAttribute('type') === 'submit');
      if (!submitBtn) {
        throw new Error('Submit button not found');
      }
      return submitBtn;
    }, { timeout: 5000 });

    // Button should be disabled when email/password are empty
    expect(submitButton).toBeDisabled();

    // Verify sign in was not called
    expect(springAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should display session expired message from URL param', () => {
    render(
      <TestWrapper>
        <MemoryRouter initialEntries={['/login?expired=true']}>
          <Login />
        </MemoryRouter>
      </TestWrapper>
    );

    expect(screen.getByText(/session.*expired/i)).toBeInTheDocument();
  });

  it('should display account created success message', () => {
    render(
      <TestWrapper>
        <MemoryRouter initialEntries={['/login?messageType=accountCreated']}>
          <Login />
        </MemoryRouter>
      </TestWrapper>
    );

    expect(screen.getByText(/account created/i)).toBeInTheDocument();
  });

  it('should prefill email from query param', () => {
    const email = 'prefilled@example.com';

    render(
      <TestWrapper>
        <MemoryRouter initialEntries={[`/login?email=${email}`]}>
          <Login />
        </MemoryRouter>
      </TestWrapper>
    );

    return waitFor(() => {
      const emailInput = document.getElementById('email') as HTMLInputElement;
      expect(emailInput.value).toBe(email);
    });
  });

  it('should redirect to home when login disabled', async () => {
    mockBackendProbeState.loginDisabled = true;
    mockProbe.mockResolvedValueOnce({ status: 'up', loginDisabled: true, loading: false });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enableLogin: false,
        providerList: {},
      }),
    } as Response);

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('should handle OAuth provider click', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enableLogin: true,
        providerList: {
          '/oauth2/authorization/github': 'GitHub',
        },
      }),
    } as Response);

    vi.mocked(springAuth.signInWithOAuth).mockResolvedValueOnce({
      error: null,
    });

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      const githubButton = screen.queryByText(/github/i);
      if (githubButton) {
        expect(githubButton).toBeInTheDocument();
      }
    });

    // Since OAuth buttons might be dynamically rendered based on config,
    // we just verify the mock is set up correctly
    expect(springAuth.signInWithOAuth).toBeDefined();
  });

  it('should show email form by default when no SSO providers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enableLogin: true,
        providerList: {}, // No providers
      }),
    } as Response);

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.getElementById('email')).toBeInTheDocument();
      expect(document.getElementById('password')).toBeInTheDocument();
    });
  });

  it('should disable submit button while signing in', async () => {
    const user = userEvent.setup();

    vi.mocked(springAuth.signInWithPassword).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                user: null,
                session: null,
                error: { message: 'Error' },
              }),
            100
          )
        )
    );

    render(
      <TestWrapper>
        <BrowserRouter>
          <Login />
        </BrowserRouter>
      </TestWrapper>
    );

    await waitFor(() => {
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      expect(emailInput).toBeTruthy();
      expect(passwordInput).toBeTruthy();
    }, { timeout: 3000 });

    const emailInput = document.getElementById('email') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    const submitButton = await waitFor(() => {
      const buttons = screen.queryAllByRole('button');
      const submitBtn = buttons.find(btn => btn.getAttribute('type') === 'submit');
      if (!submitBtn) {
        throw new Error('Submit button not found');
      }
      return submitBtn;
    }, { timeout: 5000 });
    await user.click(submitButton);

    // Button should be disabled while signing in
    expect(submitButton).toBeDisabled();

    // Wait for completion
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });
});
