/**
 * Spring Auth Client (shared engine)
 *
 * Integrates with the Spring Security + JWT backend.
 * - Uses localStorage for JWT storage (sent via Authorization header)
 * - JWT validation handled server-side
 * - No email confirmation flow (auto-confirmed on registration)
 *
 * This is the platform-agnostic engine. The HTTP transport, base path and
 * platform-specific behaviour are injected via `@shared/auth/config` so the
 * same code backs the editor (which injects its apiClient + desktop bridge)
 * and the portal (web defaults).
 */

import { AxiosError, type AxiosRequestConfig } from "axios";
import { getSpringAuthConfig } from "@shared/auth/config";
import { type OAuthProvider } from "@shared/auth/spring/oauthTypes";
import { resetOAuthState } from "@shared/auth/spring/oauthStorage";
import type {
  AuthUser as User,
  AuthSession as Session,
  AuthError,
  AuthResponse,
  AuthChangeEvent,
} from "@shared/auth/types";

export type { User, Session, AuthError, AuthResponse, AuthChangeEvent };

/** Axios config plus the editor's custom request flags (ignored by the portal). */
type AuthRequestConfig = AxiosRequestConfig & {
  suppressErrorToast?: boolean;
  skipAuthRedirect?: boolean;
};

const http = () => getSpringAuthConfig().http;
const platform = () => getSpringAuthConfig().platform;
const basePath = () => getSpringAuthConfig().basePath;

function getHttpStatus(error: unknown): number | undefined {
  if (error instanceof AxiosError) {
    return error.response?.status;
  }

  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { status?: unknown } }).response;
    if (response && typeof response.status === "number") {
      return response.status;
    }
  }

  return undefined;
}

// Helper to extract error message from axios error
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return (
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      fallback
    );
  }
  return error instanceof Error ? error.message : fallback;
}

const OAUTH_REDIRECT_COOKIE = "stirling_redirect_path";
const OAUTH_REDIRECT_COOKIE_MAX_AGE = 60 * 5; // 5 minutes

function defaultRedirectPath(): string {
  return `${basePath() || ""}/auth/callback`;
}

export const POST_LOGIN_REDIRECT_STORAGE_KEY = "stirling_post_login_path";

function normalizeRedirectPath(target?: string): string {
  if (!target || typeof target !== "string") {
    return defaultRedirectPath();
  }

  try {
    const parsed = new URL(target, window.location.origin);
    const path = parsed.pathname || "/";
    const query = parsed.search || "";
    return `${path}${query}`;
  } catch {
    const trimmed = target.trim();
    if (!trimmed) {
      return defaultRedirectPath();
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

function persistRedirectPath(path: string): void {
  try {
    document.cookie = `${OAUTH_REDIRECT_COOKIE}=${encodeURIComponent(path)}; path=/; max-age=${OAUTH_REDIRECT_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch (_error) {
    // console.warn('[SpringAuth] Failed to persist OAuth redirect path', _error);
  }
}

// Same-origin relative path, not pointing at auth plumbing. Rejects protocol-relative
// URLs to guard against open-redirect abuse if the stored value is tampered with.
export function isSafePostLoginRedirect(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.startsWith("/\\")) return false;
  const lowered = path.toLowerCase();
  if (
    lowered.startsWith("/login") ||
    lowered.startsWith("/auth/") ||
    lowered.startsWith("/oauth2") ||
    lowered.startsWith("/saml2")
  ) {
    return false;
  }
  return true;
}

export function setPostLoginRedirectPath(
  path: string | null | undefined,
): void {
  try {
    if (typeof window === "undefined") return;
    if (isSafePostLoginRedirect(path)) {
      window.sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, path);
    } else {
      window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    }
  } catch (_error) {
    // sessionStorage unavailable (private mode): fail open
  }
}

export function consumePostLoginRedirectPath(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const value = window.sessionStorage.getItem(
      POST_LOGIN_REDIRECT_STORAGE_KEY,
    );
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    return isSafePostLoginRedirect(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void;

class SpringAuthClient {
  private listeners: AuthChangeCallback[] = [];
  private sessionCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Adaptive intervals - calculated based on actual JWT token lifetime
  // Defaults for initial startup (will be recalculated on first token)
  private sessionCheckIntervalMs = 10000; // 10 seconds default
  private tokenRefreshThresholdMs = 30000; // 30 seconds default

  private readonly DESKTOP_SAAS_REFRESH_EARLY_SECONDS = 60;

  constructor() {
    // Start periodic session validation
    this.startSessionMonitoring();
  }

  /**
   * Calculate optimal check interval and refresh threshold based on token lifetime.
   * - Check interval: token lifetime / 6 (check 6 times during token life)
   * - Refresh threshold: token lifetime / 4 (refresh when 25% remaining)
   * - Applies min/max bounds for sanity
   */
  private calculateAdaptiveIntervals(token: string): void {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload) {
        console.warn(
          "[SpringAuth] Cannot decode token for adaptive intervals, using defaults",
        );
        return;
      }

      const expSeconds = typeof payload?.exp === "number" ? payload.exp : 0;
      const iatSeconds = typeof payload?.iat === "number" ? payload.iat : 0;

      if (expSeconds <= 0 || iatSeconds <= 0) {
        console.warn(
          "[SpringAuth] Token missing exp/iat claims, using default intervals",
        );
        return;
      }

      const tokenLifetimeMs = (expSeconds - iatSeconds) * 1000;

      // Check interval: check 6 times during token lifetime
      // Min: 5 seconds (for very short tokens)
      // Max: 60 seconds (don't check too infrequently)
      this.sessionCheckIntervalMs = Math.max(
        5000,
        Math.min(60000, tokenLifetimeMs / 6),
      );

      // Refresh threshold: refresh when 25% of lifetime remaining
      // Min: 30 seconds (give buffer for refresh to complete)
      // Max: 5 minutes (don't wait too long for long-lived tokens)
      this.tokenRefreshThresholdMs = Math.max(
        30000,
        Math.min(300000, tokenLifetimeMs / 4),
      );

      console.log("[SpringAuth] 📊 Adaptive intervals calculated:", {
        tokenLifetime: Math.floor(tokenLifetimeMs / 1000) + "s",
        checkInterval: Math.floor(this.sessionCheckIntervalMs / 1000) + "s",
        refreshThreshold: Math.floor(this.tokenRefreshThresholdMs / 1000) + "s",
      });

      // Restart monitoring with new interval
      this.restartSessionMonitoring();
    } catch (error) {
      console.warn(
        "[SpringAuth] Failed to calculate adaptive intervals:",
        error,
      );
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");

    return JSON.parse(atob(base64));
  }

  private getTokenExpiry(token: string): {
    expiresIn: number;
    expiresAt: number;
  } {
    try {
      const payload = this.decodeJwtPayload(token);
      if (!payload) {
        throw new Error("Token payload missing");
      }

      const expSeconds = typeof payload?.exp === "number" ? payload.exp : 0;
      const expiresAt =
        expSeconds > 0 ? expSeconds * 1000 : Date.now() + 3600 * 1000;
      const expiresIn = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000),
      );

      return { expiresIn, expiresAt };
    } catch {
      // Fallback for non-JWT or malformed tokens.
      const expiresAt = Date.now() + 3600 * 1000;
      return { expiresIn: 3600, expiresAt };
    }
  }

  /**
   * Helper to get CSRF token from cookie
   */
  private getCsrfToken(): string | null {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "XSRF-TOKEN") {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Get current session
   * JWT is stored in localStorage and sent via Authorization header
   */
  async getSession(): Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }> {
    try {
      // Get JWT from localStorage
      let token = localStorage.getItem("stirling_jwt");

      if (!token) {
        // console.debug('[SpringAuth] getSession: No JWT in localStorage');
        return { data: { session: null }, error: null };
      }

      if (await platform().isDesktopSaaSAuthMode()) {
        let tokenExpiry = this.getTokenExpiry(token);
        if (tokenExpiry.expiresIn <= this.DESKTOP_SAAS_REFRESH_EARLY_SECONDS) {
          const refreshed = await platform().refreshPlatformSession();
          if (!refreshed) {
            localStorage.removeItem("stirling_jwt");
            return { data: { session: null }, error: null };
          }

          const refreshedToken = localStorage.getItem("stirling_jwt");
          if (!refreshedToken) {
            localStorage.removeItem("stirling_jwt");
            return { data: { session: null }, error: null };
          }

          token = refreshedToken;
          tokenExpiry = this.getTokenExpiry(token);
        }

        if (tokenExpiry.expiresIn <= 0) {
          localStorage.removeItem("stirling_jwt");
          return { data: { session: null }, error: null };
        }

        const platformUser = await platform().getPlatformSessionUser();

        const session: Session = {
          user: {
            id:
              platformUser?.email ||
              platformUser?.username ||
              "desktop-saas-user",
            email: platformUser?.email ?? "",
            // Username may be empty when the platform layer can't identify
            // the user - downstream displayName derivation handles that
            // case and falls back to a generic placeholder.
            username: platformUser?.username ?? "",
            role: "USER",
            is_anonymous: platformUser?.is_anonymous,
          },
          access_token: token,
          expires_in: tokenExpiry.expiresIn,
          expires_at: tokenExpiry.expiresAt,
        };

        return { data: { session }, error: null };
      }

      // Verify with backend
      // Note: We pass the token explicitly here, overriding the interceptor's default
      // console.debug('[SpringAuth] getSession: Verifying JWT with /api/v1/auth/me');
      const meConfig: AuthRequestConfig = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        suppressErrorToast: true, // Suppress global error handler (we handle errors locally)
        // Session bootstrap should not trigger global 401 refresh/redirect loops.
        skipAuthRedirect: true,
      };
      const response = await http().get("/api/v1/auth/me", meConfig);

      // console.debug('[SpringAuth] /me response status:', response.status);
      const data = response.data;
      // console.debug('[SpringAuth] /me response data:', data);

      // Create session object
      const tokenExpiry = this.getTokenExpiry(token);
      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: tokenExpiry.expiresIn,
        expires_at: tokenExpiry.expiresAt,
      };

      // console.debug('[SpringAuth] getSession: Session retrieved successfully');
      return { data: { session }, error: null };
    } catch (error: unknown) {
      // 401/403 during getSession is the normal "token expired or invalid"
      // path - handled via refresh + JWT clear.
      const status = getHttpStatus(error);
      if (status === 401 || status === 403) {
        const refreshResult = await this.refreshSession();
        if (!refreshResult.error && refreshResult.data.session) {
          return refreshResult;
        }
        localStorage.removeItem("stirling_jwt");
        return { data: { session: null }, error: null };
      }

      console.error("[SpringAuth] getSession error:", error);
      // Don't clear token for other errors (e.g., backend not ready, network issues)
      // The token is still valid, just can't verify it right now
      return {
        data: { session: null },
        error: { message: getErrorMessage(error, "Unknown error") },
      };
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithPassword(credentials: {
    email: string;
    password: string;
    mfaCode?: string;
  }): Promise<AuthResponse> {
    try {
      const response = await http().post(
        "/api/v1/auth/login",
        {
          username: credentials.email,
          password: credentials.password,
          mfaCode: credentials.mfaCode,
        },
        {
          withCredentials: true, // Include cookies for CSRF
        },
      );

      const data = response.data;
      const token = data.session.access_token;

      // Store JWT in localStorage
      localStorage.setItem("stirling_jwt", token);
      // console.log('[SpringAuth] JWT stored in localStorage');

      // Sync token to platform-specific storage (Tauri store for desktop)
      await platform().savePlatformToken(token);

      // Calculate adaptive monitoring intervals based on token lifetime
      this.calculateAdaptiveIntervals(token);

      // Dispatch custom event for other components to react to JWT availability
      window.dispatchEvent(new CustomEvent("jwt-available"));

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners("SIGNED_IN", session);

      return { user: data.user, session, error: null };
    } catch (error: unknown) {
      console.error("[SpringAuth] signInWithPassword error:", error);
      if (error instanceof AxiosError) {
        const errorCode = error.response?.data?.error as string | undefined;
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          "Login failed";
        return {
          user: null,
          session: null,
          error: {
            message: errorMessage,
            status: error.response?.status,
            code: errorCode,
            mfaRequired: errorCode === "mfa_required",
          },
        };
      }
      return {
        user: null,
        session: null,
        error: { message: getErrorMessage(error, "Login failed") },
      };
    }
  }

  /**
   * Sign up new user
   */
  async signUp(credentials: {
    email: string;
    password: string;
    options?: { data?: { full_name?: string }; emailRedirectTo?: string };
  }): Promise<AuthResponse> {
    try {
      const response = await http().post(
        "/api/v1/user/register",
        {
          username: credentials.email,
          password: credentials.password,
        },
        {
          withCredentials: true,
        },
      );

      const data = response.data;

      // Note: Spring backend auto-confirms users (no email verification)
      // Return user but no session (user needs to login)
      return { user: data.user, session: null, error: null };
    } catch (error: unknown) {
      console.error("[SpringAuth] signUp error:", error);
      return {
        user: null,
        session: null,
        error: { message: getErrorMessage(error, "Registration failed") },
      };
    }
  }

  /**
   * Sign in with OAuth/SAML provider (GitHub, Google, Authentik, etc.)
   * This redirects to the Spring OAuth2/SAML2 authorization endpoint
   *
   * @param params.provider - Full auth path from backend (e.g., '/oauth2/authorization/google', '/saml2/authenticate/stirling')
   *                          The backend provides the complete path including the auth type and provider ID
   */
  async signInWithOAuth(params: {
    provider: OAuthProvider;
    options?: { redirectTo?: string; queryParams?: Record<string, string> };
  }): Promise<{ error: AuthError | null }> {
    try {
      const redirectPath = normalizeRedirectPath(params.options?.redirectTo);
      persistRedirectPath(redirectPath);

      // Use the full path provided by the backend
      // This supports both OAuth2 (/oauth2/authorization/...) and SAML2 (/saml2/authenticate/...)
      const redirectUrl = params.provider;
      const handled = await platform().startOAuthNavigation(redirectUrl);
      if (handled) {
        return { error: null };
      }
      // console.log('[SpringAuth] Redirecting to SSO:', redirectUrl);
      // Use window.location.assign for full page navigation
      window.location.assign(redirectUrl);
      return { error: null };
    } catch (error) {
      return {
        error: {
          message:
            error instanceof Error ? error.message : "SSO redirect failed",
        },
      };
    }
  }

  /**
   * Sign out user (invalidate session)
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "stirling_sso_auto_login_logged_out",
          "1",
        );
      }

      // Only call the backend logout endpoint when the platform tells us
      // the current backend implements it. In desktop SaaS mode the
      // apiClient points at the SaaS gateway, which doesn't expose
      // `/api/v1/auth/logout` (Supabase manages session lifecycle); POSTing
      // there returns 500 and pollutes error toasts even though the local
      // cleanup below succeeds.
      if (await platform().shouldCallBackendLogout()) {
        const response = await http().post("/api/v1/auth/logout", null, {
          headers: {
            "X-XSRF-TOKEN": this.getCsrfToken() || "",
          },
          withCredentials: true,
        });

        if (response.status === 200) {
          // console.debug('[SpringAuth] signOut: Success');
        }
      }

      // Clean up local storage
      localStorage.removeItem("stirling_jwt");
      try {
        Object.keys(localStorage)
          .filter((key) => key.startsWith("sb-") || key.includes("supabase"))
          .forEach((key) => localStorage.removeItem(key));

        // Clear any cached OAuth redirect/session state
        resetOAuthState();
      } catch (err) {
        console.warn(
          "[SpringAuth] Failed to clear Supabase/local auth tokens",
          err,
        );
      }

      // Clear cookies that might hold refresh/session tokens
      try {
        document.cookie.split(";").forEach((cookie) => {
          const eqPos = cookie.indexOf("=");
          const name =
            eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          }
        });
      } catch (err) {
        console.warn("[SpringAuth] Failed to clear cookies on sign out", err);
      }

      try {
        await platform().clearPlatformAuthAfterSignOut();
      } catch (cleanupError) {
        console.warn(
          "[SpringAuth] Failed to run platform auth cleanup",
          cleanupError,
        );
      }

      // Notify listeners
      this.notifyListeners("SIGNED_OUT", null);

      return { error: null };
    } catch (error: unknown) {
      console.error("[SpringAuth] signOut error:", error);
      // Still remove token even if backend call fails
      localStorage.removeItem("stirling_jwt");
      try {
        await platform().clearPlatformAuthAfterSignOut();
      } catch (cleanupError) {
        console.warn(
          "[SpringAuth] Failed to run platform auth cleanup after error",
          cleanupError,
        );
      }
      // The user is logged out *locally* even if the backend call failed
      // (token + platform user_info are gone). The previous version skipped
      // this notification on error - the AuthProvider then never cleared
      // its session state, leaving the UI claiming the user was still signed
      // in until a full reload.
      this.notifyListeners("SIGNED_OUT", null);
      return {
        error: { message: getErrorMessage(error, "Logout failed") },
      };
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshSession(): Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }> {
    try {
      if (await platform().isDesktopSaaSAuthMode()) {
        const refreshed = await platform().refreshPlatformSession();
        if (!refreshed) {
          localStorage.removeItem("stirling_jwt");
          return {
            data: { session: null },
            error: { message: "Token refresh failed - please log in again" },
          };
        }

        const { data, error } = await this.getSession();
        if (error || !data.session) {
          return {
            data: { session: null },
            error: error || {
              message: "Token refresh failed - please log in again",
            },
          };
        }

        // Calculate adaptive intervals for desktop SaaS mode
        const token = localStorage.getItem("stirling_jwt");
        if (token) {
          this.calculateAdaptiveIntervals(token);
        }

        this.notifyListeners("TOKEN_REFRESHED", data.session);
        return { data, error: null };
      }

      const refreshConfig: AuthRequestConfig = {
        headers: {
          "X-XSRF-TOKEN": this.getCsrfToken() || "",
        },
        withCredentials: true,
        suppressErrorToast: true, // Suppress global error handler (we handle errors locally)
      };
      const response = await http().post(
        "/api/v1/auth/refresh",
        null,
        refreshConfig,
      );

      const data = response.data;
      const token = data.session.access_token;

      // Update local storage with new token
      localStorage.setItem("stirling_jwt", token);

      // Sync token to platform-specific storage (Tauri store for desktop)
      await platform().savePlatformToken(token);

      // Calculate adaptive monitoring intervals based on token lifetime
      this.calculateAdaptiveIntervals(token);

      const session: Session = {
        user: data.user,
        access_token: token,
        expires_in: data.session.expires_in,
        expires_at: Date.now() + data.session.expires_in * 1000,
      };

      // Notify listeners
      this.notifyListeners("TOKEN_REFRESHED", session);

      console.debug("[SpringAuth] Token refreshed successfully");

      return { data: { session }, error: null };
    } catch (error: unknown) {
      localStorage.removeItem("stirling_jwt");

      // 401/403 means the refresh token is no longer valid - normal expired
      // state, not an error worth surfacing. Other statuses (network, backend
      // down) ARE worth logging.
      const status = getHttpStatus(error);
      if (status === 401 || status === 403) {
        return {
          data: { session: null },
          error: { message: "Token refresh failed - please log in again" },
        };
      }

      console.error("[SpringAuth] refreshSession error:", error);
      return {
        data: { session: null },
        error: { message: getErrorMessage(error, "Token refresh failed") },
      };
    }
  }

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: AuthChangeCallback): {
    data: { subscription: { unsubscribe: () => void } };
  } {
    this.listeners.push(callback);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.listeners = this.listeners.filter((cb) => cb !== callback);
          },
        },
      },
    };
  }

  // Private helper methods

  private notifyListeners(event: AuthChangeEvent, session: Session | null) {
    // Use setTimeout to avoid calling callbacks synchronously
    setTimeout(() => {
      this.listeners.forEach((callback) => {
        try {
          callback(event, session);
        } catch (error) {
          console.error(
            "[SpringAuth] Error in auth state change listener:",
            error,
          );
        }
      });
    }, 0);
  }

  private startSessionMonitoring() {
    // Periodically check session validity
    // Interval is adaptive based on token lifetime (calculated when token is received)
    this.sessionCheckInterval = setInterval(async () => {
      try {
        // Try to get current session
        const { data } = await this.getSession();

        // If we have a session, proactively refresh if needed
        if (data.session) {
          const timeUntilExpiry = (data.session.expires_at || 0) - Date.now();

          // Refresh if token expires soon (threshold is adaptive)
          if (
            timeUntilExpiry > 0 &&
            timeUntilExpiry < this.tokenRefreshThresholdMs
          ) {
            console.log(
              "[SpringAuth] 🔄 Proactively refreshing token (expires in " +
                Math.floor(timeUntilExpiry / 1000) +
                "s)",
            );
            await this.refreshSession();
          }
        }
      } catch (error) {
        console.error("[SpringAuth] Session monitoring error:", error);
      }
    }, this.sessionCheckIntervalMs);
  }

  private restartSessionMonitoring() {
    // Stop existing interval
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    // Start with new interval
    this.startSessionMonitoring();
  }

  public destroy() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
  }
}

export const springAuth = new SpringAuthClient();

/**
 * Get current user
 */
export const getCurrentUser = async () => {
  const { data } = await springAuth.getSession();
  return data.session?.user || null;
};

/**
 * Check if user is anonymous
 */
export const isUserAnonymous = (user: User | null) => {
  return user?.is_anonymous === true;
};

/**
 * Create an anonymous user object for use when login is disabled
 * This provides a consistent User interface throughout the app
 */
export const createAnonymousUser = (): User => {
  return {
    id: "anonymous",
    email: "anonymous@local",
    username: "Anonymous User",
    role: "USER",
    enabled: true,
    is_anonymous: true,
    app_metadata: {
      provider: "anonymous",
    },
  };
};

/**
 * Create an anonymous session for use when login is disabled
 */
export const createAnonymousSession = (): Session => {
  return {
    user: createAnonymousUser(),
    access_token: "",
    expires_in: Number.MAX_SAFE_INTEGER,
    expires_at: Number.MAX_SAFE_INTEGER,
  };
};

// Export auth client as default for convenience
export default springAuth;
