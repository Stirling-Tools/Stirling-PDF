import { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { RainbowThemeProvider } from "@app/components/shared/RainbowThemeProvider";
import Landing from "@app/routes/Landing";
import Login from "@app/routes/Login";
import Signup from "@app/routes/Signup";
import AuthCallback from "@app/routes/AuthCallback";
import InviteAccept from "@app/routes/InviteAccept";
import MobileScannerPage from "@app/pages/MobileScannerPage";
import PluginPage from "@app/pages/PluginPage";
import Onboarding from "@app/components/onboarding/Onboarding";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";
import "@app/styles/auth-theme.css";

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
                <Routes>
                  {/* Auth routes - no nested providers needed */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/invite/:token" element={<InviteAccept />} />

                  {/* Plugin route must win before the catch-all Landing */}
                  <Route path="/plugins/:id" element={<PluginPage />} />
                  {/* Main app routes - Landing handles auth logic */}
                  <Route path="/*" element={<Landing />} />
                </Routes>
                <Onboarding />
              </AppLayout>
            </AppProviders>
          }
        />
      </Routes>
    </Suspense>
  );
}
