import { Suspense } from "react";
import { Routes, Route, useParams } from "react-router-dom";
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
import ShareLinkPage from "@app/routes/ShareLinkPage";
import ParticipantView from "@app/components/workflow/ParticipantView";
import Onboarding from "@app/components/onboarding/Onboarding";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";
import "@app/styles/auth-theme.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

// Minimal providers for public routes - no API calls, no authentication
function MinimalProviders({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <RainbowThemeProvider>{children}</RainbowThemeProvider>
    </PreferencesProvider>
  );
}

// Participant signing page — token-gated, no login required
function ParticipantViewPage() {
  const { token } = useParams<{ token: string }>();
  if (!token) return null;
  return <ParticipantView token={token} />;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Participant signing — public, token-gated, no auth required */}
        <Route
          path="/workflow/sign/:token"
          element={
            <MinimalProviders>
              <ParticipantViewPage />
            </MinimalProviders>
          }
        />

        {/* All other routes need AppProviders for backend integration */}
        <Route
          path="*"
          element={
            <AppProviders>
              <AppLayout>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/invite/:token" element={<InviteAccept />} />
                  <Route path="/share/:token" element={<ShareLinkPage />} />
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
