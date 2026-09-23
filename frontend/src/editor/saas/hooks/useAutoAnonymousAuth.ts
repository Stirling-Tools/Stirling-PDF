import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { signInAnonymously, supabase } from "@app/auth/supabase";
import { isAuthRoute, isHomeRoute, isToolRoute } from "@app/utils/pathUtils";

interface AutoAnonymousAuthState {
  isAutoAuthenticating: boolean;
  autoAuthError: string | null;
  shouldTriggerAutoAuth: boolean;
}

/**
 * Automatically signs in users anonymously on direct tool access when not authenticated.
 */
export function useAutoAnonymousAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<AutoAnonymousAuthState>({
    isAutoAuthenticating: false,
    autoAuthError: null,
    shouldTriggerAutoAuth: false,
  });

  const shouldAutoAuthenticate = useCallback((): boolean => {
    const currentPath = location.pathname;
    if (isAuthRoute(currentPath)) return false;
    if (isHomeRoute(currentPath)) return false;
    return isToolRoute(currentPath);
  }, [location.pathname]);

  const waitForToken = useCallback(async (timeoutMs = 7000) => {
    // Prefer event-driven approach; fallback to polling if needed
    let resolved = false;
    const done = (ok: boolean) => {
      resolved = true;
      return ok;
    };

    const hasToken = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return !!session?.access_token;
    };

    if (await hasToken()) return true;

    const unsub = supabase.auth.onAuthStateChange(async (_evt, _session) => {
      if (!resolved && (await hasToken())) {
        unsub.data.subscription.unsubscribe();
        done(true);
      }
    });

    const started = Date.now();
    while (!resolved && Date.now() - started < timeoutMs) {
      if (await hasToken()) {
        unsub.data.subscription.unsubscribe();
        return done(true);
      }
      // gentle backoff
      await new Promise((r) => setTimeout(r, 120));
    }

    try {
      unsub.data.subscription.unsubscribe();
    } catch (err) {
      // Ignore unsubscribe errors during cleanup
      console.debug("[useAutoAnonymousAuth] Unsubscribe cleanup error:", err);
    }
    return done(false);
  }, []);

  const triggerAnonymousAuth = useCallback(async () => {
    if (state.isAutoAuthenticating) return;

    setState((prev) => ({
      ...prev,
      isAutoAuthenticating: true,
      autoAuthError: null,
    }));
    try {
      console.log("[useAutoAnonymousAuth] anonymous auth starting");

      const { error } = await signInAnonymously();
      if (error) throw error;

      // Wait for a usable token so first API calls won't 401/redirect
      const ok = await waitForToken(7000);
      if (!ok) {
        throw new Error("Timed out waiting for anonymous session token");
      }

      console.log("[useAutoAnonymousAuth] anonymous auth complete");
      setState((prev) => ({
        ...prev,
        isAutoAuthenticating: false,
        shouldTriggerAutoAuth: false,
      }));
    } catch (e) {
      console.error("[useAutoAnonymousAuth] anonymous auth failed", e);
      setState((prev) => ({
        ...prev,
        isAutoAuthenticating: false,
        autoAuthError:
          e instanceof Error ? e.message : "Anonymous authentication failed",
      }));
    }
  }, [state.isAutoAuthenticating, waitForToken]);

  // Decide whether to auto-auth on mount & whenever location/auth changes
  useEffect(() => {
    if (loading) return;
    if (session) return;
    if (state.isAutoAuthenticating) return;

    const shouldAuth = shouldAutoAuthenticate();
    if (state.shouldTriggerAutoAuth !== shouldAuth) {
      setState((prev) => ({ ...prev, shouldTriggerAutoAuth: shouldAuth }));
    }

    if (shouldAuth) {
      console.log("[useAutoAnonymousAuth] tool route detected, auto-auth");
      triggerAnonymousAuth();
    }
  }, [
    loading,
    session,
    state.isAutoAuthenticating,
    state.shouldTriggerAutoAuth,
    shouldAutoAuthenticate,
    triggerAnonymousAuth,
  ]);

  // Clear error if route is no longer a tool route, or once authenticated
  useEffect(() => {
    if (session || !shouldAutoAuthenticate()) {
      setState((prev) => ({
        ...prev,
        autoAuthError: null,
        shouldTriggerAutoAuth: false,
      }));
    }
  }, [session, shouldAutoAuthenticate]);

  return {
    isAutoAuthenticating: state.isAutoAuthenticating,
    autoAuthError: state.autoAuthError,
    shouldTriggerAutoAuth: state.shouldTriggerAutoAuth,
    triggerAnonymousAuth,
  };
}
