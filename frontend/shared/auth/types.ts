/**
 * Provider-agnostic auth model shared by the editor and the portal.
 *
 * Both the Spring (self-hosted JWT) and Supabase (cloud) backends are mapped
 * onto these shapes so consumers can read `useAuth()` without knowing which
 * backend authenticated the user.
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  /** Backend role string, e.g. "ROLE_ADMIN" / "USER". */
  role: string;
  enabled?: boolean;
  is_anonymous?: boolean;
  isFirstLogin?: boolean;
  authenticationType?: string;
  app_metadata?: Record<string, unknown>;
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  expires_in: number;
  expires_at?: number;
}

export interface AuthError {
  message: string;
  status?: number;
  code?: string;
  mfaRequired?: boolean;
}

export interface AuthResponse {
  user: AuthUser | null;
  session: AuthSession | null;
  error: AuthError | null;
}

export type AuthChangeEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED";

/**
 * The unified value exposed by `useAuth()` regardless of backend. The editor's
 * existing consumers destructure session/user/displayName/isAnonymous/loading/
 * error/signOut/refreshSession; `role` and `isAdmin` are additive and drive the
 * portal's admin gate.
 */
export interface AuthContextValue {
  session: AuthSession | null;
  user: AuthUser | null;
  displayName: string | null;
  isAnonymous: boolean;
  /** True when the current user holds an admin role. */
  isAdmin: boolean;
  /** Raw backend role string, or null when signed out. */
  role: string | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/** Which backend the shared auth provider talks to. */
export type AuthMode = "spring" | "supabase";

/**
 * Translate hook for user-facing auth copy. Apps with i18n (the editor) pass a
 * function backed by their `t`; apps without it (the portal) omit it and get
 * the English fallback.
 */
export type AuthTranslate = (key: string, fallback: string) => string;

export const defaultTranslate: AuthTranslate = (_key, fallback) => fallback;
