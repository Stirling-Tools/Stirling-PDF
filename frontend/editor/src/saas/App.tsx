import { Suspense } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { isAuthRoute } from "@app/utils/pathUtils";
import { AppProviders } from "@app/components/AppProviders";
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
import OnboardingBootstrap from "@app/components/OnboardingBootstrap";
import TrialExpiredBootstrap from "@app/components/TrialExpiredBootstrap";

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

/**
 * Onboarding and trial-expired modals must never cover auth-flow pages
 * (login, signup, OAuth consent): they steal focus from the task the user
 * was sent there to complete. Unmounting also stops their background polling.
 */
function NonAuthBootstraps() {
  const location = useLocation();
  if (isAuthRoute(location.pathname)) {
    return null;
  }
  return (
    <>
      <OnboardingBootstrap />
      <TrialExpiredBootstrap />
    </>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
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
            <Route path="/*" element={<Landing />} />
          </Routes>
          <OnboardingTour />
        </AppLayout>
      </AppProviders>
    </Suspense>
  );
}
