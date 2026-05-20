import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useAutoAnonymousAuth } from "@app/hooks/useAutoAnonymousAuth";

interface RequireAuthProps {
  fallbackPath?: string;
}

export function RequireAuth({ fallbackPath = "/login" }: RequireAuthProps) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const { isAutoAuthenticating } = useAutoAnonymousAuth();

  // Safe development-only auth bypass
  const isLocalhost =
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const devBypassEnabled = Boolean(
    import.meta.env.DEV &&
    isLocalhost &&
    import.meta.env.VITE_DEV_BYPASS_AUTH === "true",
  );

  if (devBypassEnabled) {
    console.warn(
      "[RequireAuth] DEV BYPASS ACTIVE — allowing access without session on localhost",
    );
    return <Outlet />;
  }

  // Wait for both auth bootstrap and auto-anon to finish
  if (loading || isAutoAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-6 w-6 mx-auto mb-3 border-2 border-gray-300 border-t-transparent rounded-full" />
          <p className="text-gray-600">Preparing your session…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    // Change the URL to /login
    return <Navigate to={fallbackPath} replace state={{ from: location }} />;
  }

  // Render protected routes
  return <Outlet />;
}

export default RequireAuth;
