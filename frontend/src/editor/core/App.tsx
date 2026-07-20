import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@editor/components/AppProviders";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import HomePage from "@editor/pages/HomePage";
import MobileScannerPage from "@editor/pages/MobileScannerPage";
import Onboarding from "@editor/components/onboarding/Onboarding";

// Import global styles
import "@editor/styles/tailwind.css";
import "@editor/styles/cookieconsent.css";
import "@editor/styles/index.css";

// Import file ID debugging helpers (development only)
import "@editor/utils/fileIdSafety";

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

        {/* All other routes need AppProviders for backend integration */}
        <Route
          path="*"
          element={
            <AppProviders>
              <AppLayout>
                <HomePage />
                <Onboarding />
              </AppLayout>
            </AppProviders>
          }
        />
      </Routes>
    </Suspense>
  );
}
