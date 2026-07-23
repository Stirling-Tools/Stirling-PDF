import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import HomePage from "@app/pages/HomePage";
import { useBackendProbe } from "@app/hooks/useBackendProbe";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import LoginHeader from "@app/routes/login/LoginHeader";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

/**
 * Landing component - Smart router based on authentication status
 *
 * If login is disabled: Show HomePage directly (anonymous mode)
 * If user is authenticated: Show HomePage
 * If user is not authenticated: Show Login or redirect to /login
 */
export default function Landing() {
  const { session, loading: authLoading } = useAuth();
  const { config, loading: configLoading, refetch } = useAppConfig();
  const backendProbe = useBackendProbe();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const loading = authLoading || configLoading || backendProbe.loading;

  // Debug: Track Landing component lifecycle
  useEffect(() => {
    const mountId = Math.random().toString(36).substring(7);
    console.log(
      `[Landing:${mountId}] 🔵 Component mounted at ${location.pathname}`,
    );
    console.log(`[Landing:${mountId}] Mount state:`, {
      authLoading,
      configLoading,
      backendLoading: backendProbe.loading,
      hasSession: !!session,
    });
    return () => {
      console.log(`[Landing:${mountId}] 🔴 Component unmounting`);
    };
  }, [
    location.pathname,
    authLoading,
    configLoading,
    backendProbe.loading,
    session,
  ]);

  // useBackendProbe auto-polls with backoff, so the screen advances on its own
  // when the backend comes online; just refetch config once it's up.
  useEffect(() => {
    if (backendProbe.status === "up") {
      void refetch();
      if (backendProbe.loginDisabled) {
        navigate("/", { replace: true });
      }
    }
  }, [backendProbe.status, backendProbe.loginDisabled, refetch, navigate]);

  console.log("[Landing] ════════════════════════════════════");
  console.log("[Landing] Render state:", {
    pathname: location.pathname,
    loading,
    authLoading,
    configLoading,
    backendLoading: backendProbe.loading,
    hasSession: !!session,
    hasConfig: !!config,
    loginEnabled: config?.enableLogin === true && !backendProbe.loginDisabled,
    backendStatus: backendProbe.status,
    timestamp: new Date().toISOString(),
  });
  console.log("[Landing] ════════════════════════════════════");

  // Show loading while checking auth and config
  if (loading) {
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
            {t("common.loading", "Loading...")}
          </div>
        </div>
      </div>
    );
  }

  // If login is disabled, show app directly (anonymous mode)
  if (config?.enableLogin === false || backendProbe.loginDisabled) {
    console.debug("[Landing] Login disabled - showing app in anonymous mode");
    return <HomePage />;
  }

  // If backend is not up yet and user is not authenticated, show a branded status screen.
  // A backend that is still booting shows a reassuring "starting up" state (the probe
  // auto-refreshes); a genuinely unreachable backend shows the error with a Retry button.
  if (!session && backendProbe.status !== "up") {
    const isStarting = backendProbe.status === "starting";
    const backendTitle = isStarting
      ? t("backendStartup.startingTitle", "Starting up…")
      : t("backendStartup.notFoundTitle", "Backend not found");
    const message = isStarting
      ? t(
          "backendStartup.startingMessage",
          "The backend is still starting up. This can take a moment on first launch — this screen will refresh automatically.",
        )
      : t(
          "backendStartup.unreachable",
          "The application cannot currently connect to the backend. Verify the backend status and network connectivity, then try again.",
        );
    const handleRetry = async () => {
      const result = await backendProbe.probe();
      if (result.status === "up") {
        await refetch();
        navigate("/", { replace: true });
      }
    };
    return (
      <AuthLayout>
        <LoginHeader title={backendTitle} />
        <div
          className="auth-section"
          style={{
            padding: "1.5rem",
            marginTop: "1rem",
            borderRadius: "0.75rem",
            backgroundColor: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.2)",
          }}
        >
          <p style={{ margin: "0 0 0.75rem 0", color: "var(--text-primary)" }}>
            {message}
          </p>
          {isStarting ? (
            <div
              className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mt-4"
              aria-hidden="true"
            />
          ) : (
            <Button
              type="button"
              onClick={handleRetry}
              className="auth-cta-button px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mt-5 border-0 cursor-pointer"
              style={{ width: "fit-content" }}
            >
              {t("backendStartup.retry", "Retry")}
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // If we have a session, show the main app
  // Note: First login password change is now handled by the onboarding flow
  if (session) {
    return <HomePage />;
  }

  // No session - redirect to login page
  // This ensures the URL always shows /login when not authenticated
  return config?.enableLogin === true && !backendProbe.loginDisabled ? (
    <Navigate to="/login" replace state={{ from: location }} />
  ) : (
    <HomePage />
  );
}
