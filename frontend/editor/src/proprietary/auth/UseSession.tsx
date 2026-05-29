import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { springAuth } from "@app/auth/springAuthClient";
import { clearPlatformAuthOnLoginInit } from "@app/extensions/authSessionCleanup";
import type {
  Session,
  User,
  AuthError,
  AuthChangeEvent,
} from "@app/auth/springAuthClient";

/**
 * Auth Context Type
 * Simplified version without SaaS-specific features (credits, subscriptions)
 */
interface AuthContextType {
  session: Session | null;
  user: User | null;
  /** Human-readable name for the signed-in user, or null for anonymous/signed-out. */
  displayName: string | null;
  loading: boolean;
  error: AuthError | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

/**
 * Derive a display name from the Spring user. Anonymous users get the
 * localised "User" placeholder (proprietary's chosen label for unsigned-in
 * sessions); returns null only when there is no user object at all so
 * consumers can pick their own fallback.
 */
function deriveDisplayName(
  user: User | null | undefined,
  t: TFunction,
): string | null {
  if (!user) return null;
  if (user.is_anonymous) return t("auth.displayName.user", "User");
  return user.username || user.email || null;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  displayName: null,
  loading: true,
  error: null,
  signOut: async () => {},
  refreshSession: async () => {},
});

/**
 * Auth Provider Component
 *
 * Manages authentication state and provides it to the entire app.
 * Integrates with Spring Security + JWT backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
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

  /**
   * Refresh current session
   */
  const refreshSession = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.debug("[Auth] refreshSession: start", {
        path: window.location.pathname,
      });
      console.debug("[Auth] Refreshing session...");

      const { data, error } = await springAuth.refreshSession();

      if (error) {
        console.error("[Auth] Session refresh error:", error);
        setError(error);
        setSession(null);
      } else {
        console.debug("[Auth] Session refreshed successfully");
        setSession(data.session);
      }
    } catch (err) {
      console.error("[Auth] Unexpected error during session refresh:", err);
      setError(err as AuthError);
    } finally {
      console.debug("[Auth] refreshSession: done", { hasSession: !!session });
      setLoading(false);
    }
  }, []);

  /**
   * Sign out user
   */
  const signOut = useCallback(async () => {
    try {
      setError(null);
      console.debug("[Auth] Signing out...");

      const { error } = await springAuth.signOut();

      // Always clear the in-memory session: springAuth.signOut() removes the
      // local token and platform user_info even when the backend POST fails,
      // so the user is effectively signed out either way. Leaving session
      // populated on error would mean the UI keeps the old user's badge until
      // a manual reload (the SIGNED_OUT notifyListeners call also covers this
      // path now, but clearing here is defence in depth).
      setSession(null);

      if (error) {
        console.error("[Auth] Sign out error:", error);
        setError(error);
      } else {
        console.debug("[Auth] Signed out successfully");
      }
    } catch (err) {
      console.error("[Auth] Unexpected error during sign out:", err);
      setSession(null);
      setError(err as AuthError);
    }
  }, []);

  /**
   * Initialize auth on mount
   */
  useEffect(() => {
    let mounted = true;
    const mountId = Math.random().toString(36).substring(7);
    console.log(`[Auth:${mountId}] 🔵 AuthProvider mounted`);

    const initializeAuth = async () => {
      try {
        console.debug(`[Auth:${mountId}] Initializing auth...`);
        console.debug(
          `[Auth:${mountId}] Path: ${window.location.pathname} Search: ${window.location.search}`,
        );
        // Clear any platform-specific cached auth on login page init.
        if (
          typeof window !== "undefined" &&
          window.location.pathname.startsWith("/login")
        ) {
          await clearPlatformAuthOnLoginInit();
        }

        // Skip config check entirely - let the app handle login state
        // The config will be fetched by useAppConfig when needed
        const { data, error } = await springAuth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("[Auth] Initial session error:", error);
          setError(error);
        } else {
          console.debug("[Auth] Initial session loaded:", {
            hasSession: !!data.session,
            userId: data.session?.user?.id,
            email: data.session?.user?.email,
          });
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
        console.debug(
          `[Auth:${mountId}] Initialize auth complete. mounted=${mounted}`,
        );
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for jwt-available event (triggered by desktop auth or other sources)
    const handleJwtAvailable = () => {
      console.log(`[Auth:${mountId}] ════════════════════════════════════`);
      console.log(`[Auth:${mountId}] 🔄 JWT available event received`);
      console.log(
        `[Auth:${mountId}] Current state: loading=${loading}, hasSession=${!!session}`,
      );
      console.log(
        `[Auth:${mountId}] Setting loading=true to stabilize auth state`,
      );
      setLoading(true); // Prevent unstable renders during auth state transition
      setError(null);
      console.log(`[Auth:${mountId}] Refreshing session...`);
      void initializeAuth();
    };

    window.addEventListener("jwt-available", handleJwtAvailable);

    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = springAuth.onAuthStateChange(
      async (event: AuthChangeEvent, newSession: Session | null) => {
        if (!mounted) {
          console.log(
            `[Auth:${mountId}] ⚠️  Auth state change ignored (unmounted): ${event}`,
          );
          return;
        }

        console.log(`[Auth:${mountId}] ════════════════════════════════════`);
        console.log(`[Auth:${mountId}] 📢 Auth state change event: ${event}`);
        console.log(`[Auth:${mountId}] Has session: ${!!newSession}`);
        console.log(
          `[Auth:${mountId}] User: ${newSession?.user?.email || "none"}`,
        );
        console.log(`[Auth:${mountId}] Timestamp: ${new Date().toISOString()}`);

        // Schedule state update
        setTimeout(() => {
          if (mounted) {
            console.log(
              `[Auth:${mountId}] Applying session update (event: ${event})`,
            );
            setSession(newSession);
            setError(null);

            // Handle specific events
            if (event === "SIGNED_OUT") {
              console.log(
                `[Auth:${mountId}] ✓ User signed out, session cleared`,
              );
            } else if (event === "SIGNED_IN") {
              console.log(`[Auth:${mountId}] ✓ User signed in successfully`);
            } else if (event === "TOKEN_REFRESHED") {
              console.log(`[Auth:${mountId}] ✓ Token refreshed`);
            } else if (event === "USER_UPDATED") {
              console.log(`[Auth:${mountId}] ✓ User updated`);
            }
          } else {
            console.log(
              `[Auth:${mountId}] ⚠️  Session update skipped (unmounted during timeout)`,
            );
          }
        }, 0);
      },
    );

    return () => {
      console.log(`[Auth:${mountId}] 🔴 AuthProvider unmounting`);
      mounted = false;
      window.removeEventListener("jwt-available", handleJwtAvailable);
      subscription.unsubscribe();
    };
  }, []);

  const { t } = useTranslation();
  const user = session?.user ?? null;
  const value: AuthContextType = {
    session,
    user,
    displayName: deriveDisplayName(user, t),
    loading,
    error,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * Must be used within AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

/**
 * Debug hook to expose auth state for debugging
 * Can be used in development to monitor auth state
 */
export function useAuthDebug() {
  const auth = useAuth();

  useEffect(() => {
    console.debug("[Auth Debug] Current auth state:", {
      hasSession: !!auth.session,
      hasUser: !!auth.user,
      loading: auth.loading,
      hasError: !!auth.error,
      userId: auth.user?.id,
      email: auth.user?.email,
    });
  }, [auth.session, auth.user, auth.loading, auth.error]);

  return auth;
}
