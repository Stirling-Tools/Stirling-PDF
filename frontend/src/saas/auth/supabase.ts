/**
 * Spring Security auth client for SaaS mode.
 * Replaces all Supabase auth calls with backend API calls.
 * JWT tokens are stored in localStorage and attached to requests via apiClient interceptors.
 */

const TOKEN_KEY = 'stirling_jwt';
const USER_KEY = 'stirling_user';

export interface AuthUser {
  id: string;
  email: string | null;
  username: string;
  planTier: string;
  is_anonymous?: boolean;
}

// Event system for auth state changes
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED';
type AuthListener = (event: AuthEvent, user: AuthUser | null) => void;
const listeners = new Set<AuthListener>();

function notifyListeners(event: AuthEvent, user: AuthUser | null) {
  listeners.forEach((listener) => listener(event, user));
}

/** Get the stored JWT token */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Get the stored user */
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Store auth data after login */
export function setAuthData(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyListeners('SIGNED_IN', user);
}

/** Clear auth data on logout */
export function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyListeners('SIGNED_OUT', null);
}

/** Check if user is anonymous */
export function isUserAnonymous(user: { is_anonymous?: boolean } | null): boolean {
  return user?.is_anonymous === true;
}

/** Subscribe to auth state changes. Returns unsubscribe function. */
export function onAuthStateChange(
  listener: AuthListener
): { unsubscribe: () => void } {
  listeners.add(listener);
  return {
    unsubscribe: () => listeners.delete(listener),
  };
}

/** Sign in with email/password via Spring Security backend */
export async function signInWithPassword(email: string, password: string) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  const user: AuthUser = {
    id: data.userId || data.username,
    email: data.email || email,
    username: data.username || email,
    planTier: data.planTier || 'free',
  };

  setAuthData(data.token, user);
  return { user, token: data.token };
}

/** Sign in with OAuth provider (redirects to backend OAuth flow) */
export function signInWithOAuth(provider: string, redirectTo?: string) {
  const returnUrl = redirectTo || window.location.origin + '/auth/callback';
  window.location.href = `/oauth2/authorization/${provider}?redirect_uri=${encodeURIComponent(returnUrl)}`;
}

/** Sign out via backend */
export async function signOut() {
  try {
    await fetch('/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Ignore network errors during logout
  }
  clearAuthData();
}

/** Refresh the JWT token */
export async function refreshToken(): Promise<string | null> {
  const currentToken = getToken();
  if (!currentToken) return null;

  try {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      notifyListeners('TOKEN_REFRESHED', getUser());
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Sign up with email/password */
export async function signUp(email: string, password: string) {
  const response = await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Registration failed' }));
    throw new Error(error.error || 'Registration failed');
  }

  return response.json();
}

/** Reset password request */
export async function resetPasswordForEmail(email: string) {
  const response = await fetch('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Password reset failed' }));
    throw new Error(error.error || 'Password reset failed');
  }
}

/** Update user password */
export async function updatePassword(newPassword: string) {
  const token = getToken();
  const response = await fetch('/api/v1/user/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Password update failed' }));
    throw new Error(error.error || 'Password update failed');
  }
}
