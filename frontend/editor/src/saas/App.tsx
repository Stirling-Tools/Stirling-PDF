import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppProviders
        appConfigProviderProps={{ onConfigLoaded: handleConfigLoaded }}
      >
        <AppLayout>
          <OnboardingBootstrap />
          <TrialExpiredBootstrap />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/*" element={<Landing />} />
          </Routes>
          <OnboardingTour />
        </AppLayout>
      </AppProviders>
    </Suspense>
  );
}
