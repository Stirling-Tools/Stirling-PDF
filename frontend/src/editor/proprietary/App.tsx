import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppProviders } from "@editor/components/AppProviders";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { PreferencesProvider } from "@editor/contexts/PreferencesContext";
import { ThemeProvider } from "@editor/components/shared/ThemeProvider";

const Landing = lazy(() => import("@editor/routes/Landing"));
const Login = lazy(() => import("@editor/routes/Login"));
const AuthCallback = lazy(() => import("@editor/routes/AuthCallback"));
const InviteAccept = lazy(() => import("@editor/routes/InviteAccept"));
const ShareLinkPage = lazy(() => import("@editor/routes/ShareLinkPage"));
const ParticipantView = lazy(
  () => import("@editor/components/workflow/ParticipantView"),
);
const Onboarding = lazy(
  () => import("@editor/components/onboarding/Onboarding"),
);

const MobileScannerPage = lazy(() => import("@editor/pages/MobileScannerPage"));
const MobileSignPage = lazy(() => import("@editor/pages/MobileSignPage"));
import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";
import { AppFrame } from "@editor/components/layout/AppFrame";
import { NoAppChrome } from "@editor/components/layout/NoAppChrome";
import { RootGate } from "@editor/routes/RootGate";

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

function MainRoutes() {
  return (
    <Routes>
      {/* Not the app: no rail over any of these, ever. */}
      <Route element={<NoAppChrome />}>
        <Route path="/login" element={<Login />} />
        {/* Self-hosted has no signup: old links land on login. */}
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/share/:token" element={<ShareLinkPage />} />
      </Route>
      {/* The editor and its tool routes - Landing handles auth logic */}
      <Route path="/*" element={<Landing />} />
    </Routes>
  );
}

// All other routes need AppProviders for backend integration. RootGate routes
// "/" by role before any of it mounts.
function MainApp() {
  return (
    <RootGate>
      <AppProviders>
        <AppLayout>
          <MainRoutes />
          <Onboarding />
        </AppLayout>
      </AppProviders>
    </RootGate>
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
          <Route path="*" element={<MainApp />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
