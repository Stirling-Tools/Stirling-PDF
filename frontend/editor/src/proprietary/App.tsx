import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";
import Landing from "@app/routes/Landing";
import Login from "@app/routes/Login";
import AuthCallback from "@app/routes/AuthCallback";
import InviteAccept from "@app/routes/InviteAccept";
import ShareLinkPage from "@app/routes/ShareLinkPage";
import ParticipantView from "@app/components/workflow/ParticipantView";
import Onboarding from "@app/components/onboarding/Onboarding";
import WatchedFoldersRegistration from "@app/components/watchedFolders/WatchedFoldersRegistration";

const MobileScannerPage = lazy(() => import("@app/pages/MobileScannerPage"));
const MobileSignPage = lazy(() => import("@app/pages/MobileSignPage"));
import { WATCHED_FOLDERS_ENABLED } from "@app/constants/featureFlags";
import { getAdminRouteExtensions } from "@app/routes/adminRouteExtensions";
import { AppFrame } from "@app/components/layout/AppFrame";
import { NoAppChrome } from "@app/components/layout/NoAppChrome";
import { RootGate } from "@app/routes/RootGate";

// Import global styles
import "@app/styles/tailwind.css";
import "@app/styles/cookieconsent.css";
import "@app/styles/index.css";
import "@app/auth/ui/auth-theme.css";

// Import file ID debugging helpers (development only)
import "@app/utils/fileIdSafety";

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

        {/* Mobile signature drawing - reached from the Sign tool QR code */}
        <Route
          path="/mobile-sign"
          element={
            <PublicRouteProviders>
              <MobileSignPage />
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

        {/* The two apps, under a shared frame so the quick nav rail is rendered once
            outside both. The public routes above stay outside it, with no app chrome. */}
        <Route element={<AppFrame />}>
          {/* Admin-only route-set (the portal): its own top-level shell, mounted
              before the catch-all. Absent from core/desktop builds (empty stub). */}
          {getAdminRouteExtensions()}

          {/* All other routes need AppProviders for backend integration.
              RootGate makes "/" route by role BEFORE any of it mounts, so a user
              bound for the processor never boots the editor on the way. */}
          <Route
            path="*"
            element={
              <RootGate>
                <AppProviders>
                  <AppLayout>
                    <Routes>
                      {/* Not the app: no navigation bar over any of these, even
                        after an app has been mounted in this tab. */}
                      <Route element={<NoAppChrome />}>
                        <Route path="/login" element={<Login />} />
                        {/* Self-hosted has no signup - accounts are created by an
                          admin. Old links land on login instead. */}
                        <Route
                          path="/signup"
                          element={<Navigate to="/login" replace />}
                        />
                        <Route
                          path="/auth/callback"
                          element={<AuthCallback />}
                        />
                        <Route
                          path="/invite/:token"
                          element={<InviteAccept />}
                        />
                        <Route
                          path="/share/:token"
                          element={<ShareLinkPage />}
                        />
                      </Route>
                      {/* The editor and its tool routes - Landing handles auth logic */}
                      <Route path="/*" element={<Landing />} />
                    </Routes>
                    <Onboarding />
                    {WATCHED_FOLDERS_ENABLED && <WatchedFoldersRegistration />}
                  </AppLayout>
                </AppProviders>
              </RootGate>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
