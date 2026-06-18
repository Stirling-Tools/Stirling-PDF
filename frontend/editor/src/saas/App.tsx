import { Suspense, type ReactNode } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { isAuthRoute } from "@app/utils/pathUtils";
import { AppProviders } from "@app/components/AppProviders";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { setBaseUrl } from "@app/constants/app";
import type { AppConfig } from "@app/contexts/AppConfigContext";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import OnboardingTour from "@app/components/onboarding/OnboardingTour";
import Landing from "@app/routes/Landing";
import Login from "@app/routes/Login";
import Signup from "@app/routes/Signup";
import AuthCallback from "@app/routes/AuthCallback";
import ResetPassword from "@app/routes/ResetPassword";
import OAuthConsent from "@app/routes/OAuthConsent";
import ShareLinkPage from "@app/routes/ShareLinkPage";
import MobileScannerPage from "@app/pages/MobileScannerPage";
import OnboardingBootstrap from "@app/components/OnboardingBootstrap";
import SignupRequiredBootstrap from "@app/components/SignupRequiredBootstrap";
import UsageLimitModalHost from "@app/components/UsageLimitModalHost";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/saas-theme.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

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

        {/* Everything else needs the auth/backend providers. */}
        <Route
          path="*"
          element={
            <AppProviders
              appConfigProviderProps={{ onConfigLoaded: handleConfigLoaded }}
            >
              <AppLayout>
                <NonAuthBootstraps />
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
