import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useAutoAnonymousAuth } from "@app/hooks/useAutoAnonymousAuth";
import { isToolRoute } from "@app/utils/pathUtils";
import HomePage from "@app/pages/HomePage";
import Login from "@app/routes/Login";
import GuestUserBanner from "@app/components/auth/GuestUserBanner";
import { TrialStatusBanner } from "@app/components/shared/TrialStatusBanner";

export default function Landing() {
  const { session, loading } = useAuth();
  const { isAutoAuthenticating, autoAuthError, shouldTriggerAutoAuth } =
    useAutoAnonymousAuth();
  const location = useLocation();

  // Check if current path is a tool (prevents premature navigation on first render)
  const isCurrentPathTool = useMemo(
    () => isToolRoute(location.pathname),
    [location.pathname],
  );

  // Match the same guarded bypass used in RequireAuth
  const isLocalhost =
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const devBypassEnabled = Boolean(
    import.meta.env.DEV &&
    isLocalhost &&
    import.meta.env.VITE_DEV_BYPASS_AUTH === "true",
  );

  console.log("[Landing] State:", {
    pathname: location.pathname,
    loading,
    hasSession: !!session,
    isAutoAuthenticating,
    shouldTriggerAutoAuth,
    isCurrentPathTool,
    autoAuthError,
  });

  // Show loading while checking auth, while auto-authenticating, OR while preparing to auto-authenticate
  // CRITICAL: Also wait if shouldTriggerAutoAuth is true OR if we're on a tool route (prevents navigation before hook evaluates)
  if (
    loading ||
    isAutoAuthenticating ||
    (!session && (shouldTriggerAutoAuth || isCurrentPathTool) && !autoAuthError)
  ) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <div className="text-gray-600">
            {isAutoAuthenticating ? "Setting up your session..." : "Loading..."}
          </div>
        </div>
      </div>
    );
  }

  // If we have a session or dev bypass is enabled, show the main app
  if (session || devBypassEnabled) {
    return (
      <>
        <GuestUserBanner />
        <TrialStatusBanner />
        <HomePage />
      </>
    );
  }

  // If auto-authentication failed, navigate to login with error state
  if (autoAuthError && shouldTriggerAutoAuth) {
    return (
      <Navigate to="/login" replace state={{ autoAuthError, from: location }} />
    );
  }

  // If we're at home route ("/"), show login directly (marketing/landing page)
  // Otherwise navigate to login (fixes URL mismatch for tool routes)
  const isHome = location.pathname === "/" || location.pathname === "";
  if (isHome) {
    return <Login />;
  }

  // For non-home routes without auth, navigate to login (preserves from location)
  return <Navigate to="/login" replace state={{ from: location }} />;
}
