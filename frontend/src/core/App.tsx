import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { RainbowThemeProvider } from "@app/components/shared/RainbowThemeProvider";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import HomePage from "@app/pages/HomePage";
import MobileScannerPage from "@app/pages/MobileScannerPage";
import Onboarding from "@app/components/onboarding/Onboarding";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

// Minimal providers for mobile scanner - no API calls, no authentication
function MobileScannerProviders({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <RainbowThemeProvider>
        {children}
      </RainbowThemeProvider>
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
            <MobileScannerProviders>
              <MobileScannerPage />
            </MobileScannerProviders>
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
