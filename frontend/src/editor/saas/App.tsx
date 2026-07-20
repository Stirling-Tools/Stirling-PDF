import { Suspense, type ReactNode } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { isAuthRoute } from "@editor/utils/pathUtils";
import { AppProviders } from "@editor/components/AppProviders";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import { setBaseUrl } from "@editor/constants/app";
import type { AppConfig } from "@editor/contexts/AppConfigContext";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import OnboardingTour from "@editor/components/onboarding/OnboardingTour";
import Landing from "@editor/routes/Landing";
import Login from "@editor/routes/Login";
import Signup from "@editor/routes/Signup";
import AuthCallback from "@editor/routes/AuthCallback";
import ResetPassword from "@editor/routes/ResetPassword";
import OAuthConsent from "@editor/routes/OAuthConsent";
import ShareLinkPage from "@editor/routes/ShareLinkPage";
import MobileScannerPage from "@editor/pages/MobileScannerPage";
import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";
import OnboardingBootstrap from "@editor/components/OnboardingBootstrap";
import SignupRequiredBootstrap from "@editor/components/SignupRequiredBootstrap";
import UsageLimitModalHost from "@editor/components/UsageLimitModalHost";
import { LoginLandingRedirect } from "@editor/components/LoginLandingRedirect";

// Import global styles
import "@editor/styles/tailwind.css";
import "@editor/styles/saas-theme.css";
import "@editor/styles/cookieconsent.css";
import "@editor/styles/index.css";

// Import file ID debugging helpers (development only)
import "@editor/utils/fileIdSafety";

function handleConfigLoaded(config: AppConfig) {
  if (config.baseUrl) setBaseUrl(config.baseUrl);
}

// Minimal providers for the public, no-auth mobile-scanner page. Just theme +
// preferences, no AppProviders, so no auth and no backend bootstrap - it
// renders without a logged-in session.
function PublicRouteProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </PreferencesProvider>
  );
}

/**
 * Onboarding / sign-up modals must never cover auth-flow pages (login, signup,
 * OAuth consent): they steal focus from the task the user was sent there to
 * complete.
 */
function NonAuthBootstraps() {
  const location = useLocation();
  if (isAuthRoute(location.pathname)) {
    return null;
  }
  return (
    <>
      <OnboardingBootstrap />
      <SignupRequiredBootstrap />
      <UsageLimitModalHost />
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Mobile scanner - public, no auth. Opened on a phone via the QR code,
            so it must render without a logged-in session. Kept outside
            AppProviders or it falls through to the auth-gated catch-all. */}
        <Route
          path="/mobile-scanner"
          element={
            <PublicRouteProviders>
              <MobileScannerPage />
            </PublicRouteProviders>
          }
        />

        {/* Admin-only route-set (the portal): its own top-level shell, mounted
            before the catch-all. */}
        {getAdminRouteExtensions()}

        {/* Everything else needs the auth/backend providers. */}
        <Route
          path="*"
          element={
            <AppProviders
              appConfigProviderProps={{ onConfigLoaded: handleConfigLoaded }}
            >
              <AppLayout>
                <NonAuthBootstraps />
                <LoginLandingRedirect />
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/auth/reset" element={<ResetPassword />} />
                  <Route path="/oauth/consent" element={<OAuthConsent />} />
                  {/* Shared-file links. Team invites are NOT routed here: on
                      SaaS they are accepted in-app via the Supabase team
                      invitation banner, not the Spring password-based
                      /invite/:token page used by the self-hosted build. */}
                  <Route path="/share/:token" element={<ShareLinkPage />} />
                  <Route path="/*" element={<Landing />} />
                </Routes>
                <OnboardingTour />
              </AppLayout>
            </AppProviders>
          }
        />
      </Routes>
    </Suspense>
  );
}
