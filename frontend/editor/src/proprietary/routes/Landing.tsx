import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useSuppressQuickNavRail } from "@app/contexts/QuickNavHostContext";
import { AppRoot } from "@app/components/layout/AppRoot";
import { useBackendProbe } from "@app/hooks/useBackendProbe";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import LoginHeader from "@app/routes/login/LoginHeader";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";

/**
 * Landing component - Smart router based on authentication status
 *
 * If login is disabled: Show the app directly (anonymous mode)
 * If user is authenticated: Show the app
 * If user is not authenticated: Show Login or redirect to /login
 */
export default function Landing() {
  const { session, loading: authLoading } = useAuth();
  const { config, loading: configLoading, refetch } = useAppConfig();
  const backendProbe = useBackendProbe();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // The probe gates only the signed-out backend-down screen: a session means
  // /auth/me already answered.
  const loading = authLoading || (!session && configLoading && !config);
  const probePending = backendProbe.loading;

  // The backend-down screen is not the app. Loading is: it resolves in a moment.
  useSuppressQuickNavRail(
    !loading && !probePending && !session && backendProbe.status === "down",
  );

  // Periodically probe while backend isn't up so the screen can auto-advance when it comes online
  useEffect(() => {
    if (backendProbe.status === "up" || backendProbe.loginDisabled) {
      return;
    }
    const tick = async () => {
      const result = await backendProbe.probe();
      if (result.status === "up") {
        await refetch();
        if (result.loginDisabled) {
          navigate(EDITOR_BASENAME, { replace: true });
        }
      }
    };
    const intervalId = window.setInterval(() => {
      void tick();
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [
    backendProbe.status,
    backendProbe.loginDisabled,
    backendProbe.probe,
    navigate,
    refetch,
  ]);

  // If we have a session, show the main app directly
  if (session) {
    return <AppRoot />;
  }

  const returnTo = encodeURIComponent(
    location.pathname + location.search + location.hash,
  );

  let isServerLoginEnabled =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { STIRLING_PDF_ENABLE_LOGIN?: boolean })
        .STIRLING_PDF_ENABLE_LOGIN,
    );
  if (!isServerLoginEnabled && typeof window !== "undefined") {
    try {
      if (localStorage.getItem("stirling_login_enabled") === "true") {
        isServerLoginEnabled = true;
      }
    } catch {
      // Storage blocked
    }
  }

  if (isServerLoginEnabled) {
    return (
      <Navigate
        to={`/login?from=${returnTo}`}
        replace
        state={{ from: location }}
      />
    );
  }

  // If backend is confirmed unreachable and not currently probing, show status screen
  if (!probePending && backendProbe.status === "down") {
    const backendTitle = t("backendStartup.notFoundTitle", "Backend not found");
    const handleRetry = async () => {
      const result = await backendProbe.probe();
      if (result.status === "up") {
        await refetch();
        navigate(EDITOR_BASENAME, { replace: true });
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
            backgroundColor:
              "color-mix(in srgb, var(--c-primary) 8%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--c-primary) 20%, transparent)",
          }}
        >
          <p style={{ margin: "0 0 0.75rem 0", color: "var(--c-text)" }}>
            {t(
              "backendStartup.unreachable",
              "The application cannot currently connect to the backend. Verify the backend status and network connectivity, then try again.",
            )}
          </p>
          <Button
            type="button"
            onClick={handleRetry}
            className="auth-cta-button px-4 py-[0.75rem] rounded-[0.625rem] text-base font-semibold mt-5 border-0 cursor-pointer"
            style={{ width: "fit-content" }}
          >
            {t("backendStartup.retry", "Retry")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // If config resolved and login is explicitly enabled, redirect to login
  if (!loading && config?.enableLogin === true && !backendProbe.loginDisabled) {
    return (
      <Navigate
        to={`/login?from=${returnTo}`}
        replace
        state={{ from: location }}
      />
    );
  }

  return <AppRoot />;
}
