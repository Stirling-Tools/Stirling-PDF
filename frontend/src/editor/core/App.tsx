import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@editor/components/AppProviders";
import { PlatformProviders } from "@editor/components/PlatformProviders";
import { PublicRouteProviders } from "@editor/components/PublicRouteProviders";
import { AppFrame } from "@editor/components/layout/AppFrame";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { AppRoot } from "@editor/components/layout/AppRoot";
import Onboarding from "@editor/components/onboarding/Onboarding";

const MobileScannerPage = lazy(() => import("@editor/pages/MobileScannerPage"));
const MobileSignPage = lazy(() => import("@editor/pages/MobileSignPage"));

// Import global styles
import "@editor/styles/tailwind.css";
import "@editor/styles/cookieconsent.css";
import "@editor/styles/index.css";

// Import file ID debugging helpers (development only)
import "@editor/utils/fileIdSafety";

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

        {/* The app, under a shared frame so the rail renders once outside it. */}
        <Route
          element={
            <PlatformProviders>
              <AppFrame />
            </PlatformProviders>
          }
        >
          {/* Everything else is the editor. */}
          <Route
            path="*"
            element={
              <AppProviders>
                <AppLayout>
                  <AppRoot />
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
