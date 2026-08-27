import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppFrame } from "@app/components/layout/AppFrame";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import HomePage from "@app/pages/HomePage";
import Onboarding from "@app/components/onboarding/Onboarding";

const MobileScannerPage = lazy(() => import("@app/pages/MobileScannerPage"));
const MobileSignPage = lazy(() => import("@app/pages/MobileSignPage"));

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

        {/* Mobile signature drawing - reached from the Sign tool QR code */}
        <Route
          path="/mobile-sign"
          element={
            <PublicRouteProviders>
              <MobileSignPage />
            </PublicRouteProviders>
          }
        />

        {/* The app, under a shared frame so the quick nav rail is rendered
            once outside it. The public routes above stay outside the frame. */}
        <Route element={<AppFrame />}>
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
        </Route>
      </Routes>
    </Suspense>
  );
}
