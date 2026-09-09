import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppProviders } from "@app/components/AppProviders";
import { AppLayout } from "@app/components/AppLayout";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";
import { ThemeProvider } from "@app/components/shared/ThemeProvider";

const Landing = lazy(() => import("@app/routes/Landing"));
const Login = lazy(() => import("@app/routes/Login"));
const AuthCallback = lazy(() => import("@app/routes/AuthCallback"));
const InviteAccept = lazy(() => import("@app/routes/InviteAccept"));
const ShareLinkPage = lazy(() => import("@app/routes/ShareLinkPage"));
const ParticipantView = lazy(
  () => import("@app/components/workflow/ParticipantView"),
);
const Onboarding = lazy(() => import("@app/components/onboarding/Onboarding"));
const WatchedFoldersRegistration = lazy(
  () => import("@app/components/watchedFolders/WatchedFoldersRegistration"),
);

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

        {/* Both apps, under a shared frame so the rail renders once outside them. */}
        <Route element={<AppFrame />}>
          {/* The portal: its own shell, before the catch-all. An empty stub in core. */}
          {getAdminRouteExtensions()}

          {/* All other routes need AppProviders for backend integration. RootGate
              routes "/" by role before any of it mounts. */}
          <Route
            path="*"
            element={
              <RootGate>
                <AppProviders>
                  <AppLayout>
                    <Routes>
                      {/* Not the app: no rail over any of these, ever. */}
                      <Route element={<NoAppChrome />}>
                        <Route path="/login" element={<Login />} />
                        {/* Self-hosted has no signup: old links land on login. */}
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
