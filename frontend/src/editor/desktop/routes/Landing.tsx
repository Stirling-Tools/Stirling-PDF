import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppRoot } from "@editor/components/layout/AppRoot";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";

// Its own chunk: most sessions never open it.
const DesktopProcessor = lazy(async () => {
  const m = await import("@processor/DesktopProcessor");
  return { default: m.DesktopProcessor };
});

/**
 * Desktop override of Landing.
 * In desktop builds, authentication is managed entirely by AppProviders,
 * the DesktopOnboardingModal, and the SignInModal — never by routing to /login.
 * The Processor is a page of the app here, under the same providers as the
 * editor; everything else renders the main app, with the onboarding and
 * sign-in modals on top when authentication is required.
 */
export default function Landing() {
  return (
    <Routes>
      <Route
        path={`${PORTAL_BASENAME}/*`}
        element={
          <Suspense fallback={<LoadingFallback />}>
            <DesktopProcessor />
          </Suspense>
        }
      />
      <Route path="*" element={<AppRoot />} />
    </Routes>
  );
}
