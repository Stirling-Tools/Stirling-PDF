import { Suspense, lazy } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { isAuthRoute } from "@editor/utils/pathUtils";
import { AppProviders } from "@editor/components/AppProviders";
import { PublicRouteProviders } from "@editor/components/PublicRouteProviders";
import { RunLocationGate } from "@editor/components/runLocation/RunLocationGate";
import { setBaseUrl } from "@editor/constants/app";
import type { AppConfig } from "@editor/contexts/AppConfigContext";
import { AppLayout } from "@editor/components/AppLayout";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import OnboardingTour from "@editor/components/onboarding/OnboardingTour";
import Landing from "@editor/routes/Landing";
import Login from "@editor/routes/Login";
import { ResumePendingConnect } from "@editor/routes/ResumePendingConnect";
import Signup from "@editor/routes/Signup";
import AuthCallback from "@editor/routes/AuthCallback";
import ResetPassword from "@editor/routes/ResetPassword";
import OAuthConsent from "@editor/routes/OAuthConsent";
import ConnectApprove from "@editor/routes/ConnectApprove";
import ShareLinkPage from "@editor/routes/ShareLinkPage";
import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";
import { AppFrame } from "@editor/components/layout/AppFrame";
import { NoAppChrome } from "@editor/components/layout/NoAppChrome";
import OnboardingBootstrap from "@editor/components/OnboardingBootstrap";
import SignupRequiredBootstrap from "@editor/components/SignupRequiredBootstrap";
import UsageLimitModalHost from "@editor/components/UsageLimitModalHost";
import { RootGate } from "@editor/routes/RootGate";

const MobileScannerPage = lazy(() => import("@editor/pages/MobileScannerPage"));
const MobileSignPage = lazy(() => import("@editor/pages/MobileSignPage"));

// Import global styles
import "@editor/styles/tailwind.css";
import "@editor/auth/ui/auth-theme.css";
import "@editor/styles/cookieconsent.css";
import "@editor/styles/index.css";

// Import file ID debugging helpers (development only)
import "@editor/utils/fileIdSafety";

function handleConfigLoaded(config: AppConfig) {
  if (config.baseUrl) setBaseUrl(config.baseUrl);
}

/**
 * Onboarding / sign-up modals must never cover auth-flow pages (login, signup,
 * OAuth consent): they steal focus from the task the user was sent there to
 * complete.
 */
function NonAuthBootstraps() {
  const location = useLocation();
  if (isAuthRoute(location.pathname)) {
    return null;
  }
  return (
    <>
      <OnboardingBootstrap />
      <SignupRequiredBootstrap />
      <UsageLimitModalHost />
    </>
  );
}

function MainRoutes() {
  return (
    <Routes>
      {/* Not the app: no rail over any of these, ever. */}
      <Route element={<NoAppChrome />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset" element={<ResetPassword />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        {/* Human half of the self-hosted account-link handshake. It lives on
            this origin because a customer hostname can never be in the
            provider's redirect allow-list. Grouped with the pages above: it is
            an approval step, not the app. */}
        <Route path="/link" element={<ConnectApprove />} />
        {/* Shared-file links. Team invites are NOT routed here: on SaaS they
            are accepted in-app via the Supabase team invitation banner, not the
            Spring password-based /invite/:token page used by the self-hosted
            build. */}
        <Route path="/share/:token" element={<ShareLinkPage />} />
      </Route>
      <Route path="/*" element={<Landing />} />
    </Routes>
  );
}

// Everything else needs the auth/backend providers. RootGate routes "/" by role
// before any of it mounts.
function MainApp() {
  return (
    <RootGate>
      <AppProviders
        appConfigProviderProps={{ onConfigLoaded: handleConfigLoaded }}
      >
        <AppLayout>
          <NonAuthBootstraps />
          <ResumePendingConnect />
          <MainRoutes />
          <OnboardingTour />
        </AppLayout>
      </AppProviders>
    </RootGate>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Mobile scanner - public, no auth. Opened on a phone via the QR code,
            so it must render without a logged-in session. Kept outside
            AppProviders or it falls through to the auth-gated catch-all. */}
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

        {/* Before the frame and auth, so a first visit sees the chooser alone. */}
        <Route element={<RunLocationGate />}>
          {/* Both apps, under a shared frame so the rail renders once outside them. */}
          <Route element={<AppFrame />}>
            {/* The portal: its own top-level shell, before the catch-all. */}
            {getAdminRouteExtensions()}
            <Route path="*" element={<MainApp />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
