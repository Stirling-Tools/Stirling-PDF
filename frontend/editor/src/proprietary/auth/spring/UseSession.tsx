import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { springAuth } from "@app/auth/spring/springAuthClient";
import { getSpringAuthConfig } from "@app/auth/config";
import { isAdminRole } from "@app/auth/roles";
import { AuthContext } from "@app/auth/context";
import { JWT_STORAGE_KEY } from "@app/auth/httpClient";
import {
  defaultTranslate,
  type AuthContextValue,
  type AuthChangeEvent,
  type AuthError,
  type AuthSession,
  type AuthUser,
  type AuthTranslate,
} from "@app/auth/types";
import { suspendWorkbenchSession } from "@app/services/workbenchSession";

/**
 * Decodes the stored JWT payload synchronously so the authenticated shell
 * mounts on the first render without waiting for the network check.
 */
function decodeInitialSpringSession(): AuthSession | null {
  try {
    if (typeof window === "undefined") return null;
    const token = window.localStorage.getItem(JWT_STORAGE_KEY);
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
    const payload = JSON.parse(atob(base64)) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") return null;
    const expSeconds = typeof payload.exp === "number" ? payload.exp : 0;
    const expiresAt = expSeconds > 0 ? expSeconds * 1000 : 0;
    if (expiresAt > 0 && expiresAt <= Date.now()) {
      return null;
    }
    const username =
      (typeof payload.sub === "string" ? payload.sub : "") ||
      (typeof payload.username === "string" ? payload.username : "");
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = typeof payload.role === "string" ? payload.role : "USER";
    const user: AuthUser = {
      id: username || "user",
      username,
      email,
      role,
    };
    return {
      user,
      access_token: token,
      expires_in:
        expiresAt > 0
          ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
          : 3600,
      expires_at: expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Strip the configured base path so route comparisons work under subpath
 * deploys. Mirrors the editor's `stripBasePath` but reads the injected base.
 */
function stripBasePath(pathname: string): string {
  const base = getSpringAuthConfig().basePath;
  if (!base) return pathname;
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return pathname;
}

/**
 * Derive a display name from the Spring user. Anonymous users get the
 * (optionally localised) "User" placeholder; returns null only when there is
 * no user object at all so consumers can pick their own fallback.
 */
export function deriveDisplayName(
  user: AuthUser | null | undefined,
  translate: AuthTranslate = defaultTranslate,
): string | null {
  if (!user) return null;
  if (user.is_anonymous) return translate("auth.displayName.user", "User");
  return user.username || user.email || null;
}

export interface SpringAuthProviderProps {
  children: ReactNode;
  /**
   * Optional translate function for user-facing copy. The editor passes one
   * backed by i18next; the portal omits it and gets English fallbacks.
   */
  translate?: AuthTranslate;
}

/**
 * Auth Provider Component
 *
 * Manages authentication state and provides it to the app. Integrates with the
 * Spring Security + JWT backend via the shared engine.
 */
export function SpringAuthProvider({
  children,
  translate = defaultTranslate,
}: SpringAuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(
    decodeInitialSpringSession,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  // Debug: Track state transitions
  useEffect(() => {
    console.log("[Auth] State changed:", {
      loading,
      hasSession: !!session,
      hasError: !!error,
      userId: session?.user?.id,
      timestamp: new Date().toISOString(),
    });
  }, [loading, session, error]);

  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await springAuth.refreshSession();

      if (error) {
        console.error("[Auth] Session refresh error:", error);
        setError(error);
        setSession(null);
      } else {
        setSession(data.session);
      }
    } catch (err) {
      console.error("[Auth] Unexpected error during session refresh:", err);
      setError(err as AuthError);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setError(null);
      // Signing out is deliberate, unlike an identity check that merely failed: drop the
      // workbench record here and stop recording, so the teardown that follows cannot
      // write it back for whoever signs in next.
      suspendWorkbenchSession();

      const { error } = await springAuth.signOut();

      // Always clear the in-memory session: springAuth.signOut() removes the
      // local token and platform user_info even when the backend POST fails,
      // so the user is effectively signed out either way.
      setSession(null);

      if (error) {
        console.error("[Auth] Sign out error:", error);
        setError(error);
      }
    } catch (err) {
      console.error("[Auth] Unexpected error during sign out:", err);
      setSession(null);
      setError(err as AuthError);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Clear any platform-specific cached auth on login page init.
        if (
          typeof window !== "undefined" &&
          stripBasePath(window.location.pathname).startsWith("/login")
        ) {
          await getSpringAuthConfig().platform.clearPlatformAuthOnLoginInit();
        }

        const { data, error } = await springAuth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("[Auth] Initial session error:", error);
          setError(error);
          setSession(null);
        } else {
          setSession(data.session);
        }
      } catch (err) {
        console.error(
          "[Auth] Unexpected error during auth initialization:",
          err,
        );
        if (mounted) {
          setError(err as AuthError);
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for jwt-available event (triggered by desktop auth or AuthCallback)
    const handleJwtAvailable = () => {
      setLoading(true); // Prevent unstable renders during auth state transition
      setError(null);
      void initializeAuth();
    };

    window.addEventListener("jwt-available", handleJwtAvailable);

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = springAuth.onAuthStateChange(
      async (_event: AuthChangeEvent, newSession: AuthSession | null) => {
        if (!mounted) return;
        // Schedule state update on the next tick to match the previous behaviour.
        setTimeout(() => {
          if (mounted) {
            setSession(newSession);
            setError(null);
          }
        }, 0);
      },
    );

    return () => {
      mounted = false;
      window.removeEventListener("jwt-available", handleJwtAvailable);
      subscription.unsubscribe();
    };
    // Run once on mount: the provider owns its own subscription lifecycle.
  }, []);

  const user = session?.user ?? null;
  const value: AuthContextValue = useMemo(
    () => ({
      session,
      user,
      displayName: deriveDisplayName(user, translate),
      isAnonymous: user?.is_anonymous === true,
      isAdmin: isAdminRole(user?.role),
      portalAccess: user?.portalAccess ?? isAdminRole(user?.role),
      role: user?.role ?? null,
      loading,
      error,
      signOut,
      refreshSession,
    }),
    [session, user, translate, loading, error, signOut, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
