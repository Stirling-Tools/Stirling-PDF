import { Suspense } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import { AppProviders } from "@editor/components/AppProviders";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";
import Landing from "@editor/routes/Landing";
import Login from "@editor/routes/Login";
import Signup from "@editor/routes/Signup";
import AuthCallback from "@editor/routes/AuthCallback";
import InviteAccept from "@editor/routes/InviteAccept";
import ShareLinkPage from "@editor/routes/ShareLinkPage";
import ParticipantView from "@editor/components/workflow/ParticipantView";
import MobileScannerPage from "@editor/pages/MobileScannerPage";
import Onboarding from "@editor/components/onboarding/Onboarding";
import WatchedFoldersRegistration from "@editor/components/watchedFolders/WatchedFoldersRegistration";
import { WATCHED_FOLDERS_ENABLED } from "@editor/constants/featureFlags";
import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";
import { LoginLandingRedirect } from "@editor/components/LoginLandingRedirect";

// Import global styles
import "@editor/styles/tailwind.css";
import "@editor/styles/cookieconsent.css";
import "@editor/styles/index.css";
import "@editor/auth/ui/auth-theme.css";

// Import file ID debugging helpers (development only)
import "@editor/utils/fileIdSafety";

// Minimal providers for public, no-auth pages (mobile scanner, participant
// signing) - no API calls, no authentication
function PublicRouteProviders({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>{children}</ThemeProvider>
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
        {/* Mobile scanner route - no backend needed, pure P2P WebRTC */}
        <Route
          path="/mobile-scanner"
          element={
            <PublicRouteProviders>
              <MobileScannerPage />
            </PublicRouteProviders>
          }
        />

        {/* Participant signing — public, token-gated, no auth required */}
        <Route
          path="/workflow/sign/:token"
          element={
            <PublicRouteProviders>
              <ParticipantViewPage />
            </PublicRouteProviders>
          }
        />

        {/* Admin-only route-set (the portal): its own top-level shell, mounted
            before the catch-all. Absent from core/desktop builds (empty stub). */}
        {getAdminRouteExtensions()}

        {/* All other routes need AppProviders for backend integration */}
        <Route
          path="*"
          element={
            <AppProviders>
              <AppLayout>
                <LoginLandingRedirect />
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
                {WATCHED_FOLDERS_ENABLED && <WatchedFoldersRegistration />}
              </AppLayout>
            </AppProviders>
          }
        />
      </Routes>
    </Suspense>
  );
}
