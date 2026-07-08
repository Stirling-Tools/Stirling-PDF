import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import HomePage from "@app/pages/HomePage";
import MobileScannerPage from "@app/pages/MobileScannerPage";
import Onboarding from "@app/components/onboarding/Onboarding";
import { OnboardingPreviewRoute } from "@app/dev/onboardingPreview/OnboardingPreviewPage";
import OnboardingDevFab from "@app/dev/onboardingPreview/OnboardingDevFab";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

// Minimal providers for the public, no-auth mobile-scanner page - no API
// calls, no authentication
function PublicRouteProviders({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </PreferencesProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Mobile scanner route - no backend needed, pure P2P WebRTC */}
        <Route
          path="/mobile-scanner"
          element={
            <PublicRouteProviders>
              <MobileScannerPage />
            </PublicRouteProviders>
          }
        />

        {/* Dev-only onboarding persona preview — gated by VITE_DEV_ONBOARDING_PREVIEW.
            Uses the same minimal providers as the public route; the component
            redirects home when the flag is off. */}
        <Route
          path="/dev/onboarding"
          element={
            <PublicRouteProviders>
              <OnboardingPreviewRoute />
            </PublicRouteProviders>
          }
        />

        {/* All other routes need AppProviders for backend integration */}
        <Route
          path="*"
          element={
            <AppProviders>
              <AppLayout>
                <HomePage />
                <Onboarding />
                <OnboardingDevFab />
              </AppLayout>
            </AppProviders>
          }
        />
      </Routes>
    </Suspense>
  );
}
