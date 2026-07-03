import { useEffect, useState, useCallback, type ReactNode } from "react";
import { springAuth } from "@shared/auth/spring/springAuthClient";
import { getSpringAuthConfig } from "@shared/auth/config";
import { isAdminRole } from "@shared/auth/roles";
import { AuthContext } from "@shared/auth/context";
import {
  defaultTranslate,
  type AuthContextValue,
  type AuthChangeEvent,
  type AuthError,
  type AuthSession,
  type AuthUser,
  type AuthTranslate,
} from "@shared/auth/types";

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
  const [session, setSession] = useState<AuthSession | null>(null);
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
  const value: AuthContextValue = {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
