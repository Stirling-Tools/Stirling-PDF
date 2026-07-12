import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { isAuthRoute } from "@app/constants/routes";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { Z_INDEX_SIGN_IN_MODAL } from "@app/styles/zIndex";
import {
  consumeLoginLandingPending,
  fetchLandsOnProcessor,
  hasLoginLandingPending,
  isPortalAvailable,
  loginLandingMode,
} from "@app/utils/loginLanding";

/**
 * On a fresh sign-in (any flavor), sends processor users to the processor and
 * everyone else to the editor. Fires once per login, guarded by a sessionStorage
 * flag set at login and consumed only once the destination is decided, so it
 * never hijacks later in-session navigation. Gated by the VITE_LOGIN_LANDING_MODE
 * soft-release flag ("dynamic" to enable).
 *
 * The decision (see fetchLandsOnProcessor) is driven by the shared /api/v1/auth/me
 * so self-hosted and SaaS share one code path. While the lookup is in flight for
 * a would-be processor user, a full-screen loader is shown so the editor never
 * flashes before the redirect resolves.
 *
 * Mounted once (in AppProviders) for every flavor; not on the portal route-set,
 * which is a separate top-level route.
 */
export function LoginLandingRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isAnonymous } = useAuth();
  const { preferences } = usePreferences();
  // A settled, non-anonymous session. Depend on this boolean rather than the
  // session object so the effect - and its in-flight lookup - is not torn down
  // by the identity churn of setSession() firing on every auth event.
  const isSignedIn = !!session && !isAnonymous;
  const landingView = preferences.loginLandingView;
  const [resolving, setResolving] = useState(false);

  // One-time config log so a live instance reveals the silent build gates
  // (soft-release mode off, or portal not bundled) even before any login.
  useEffect(() => {
    console.debug("[login-landing] config", {
      mode: loginLandingMode(),
      portalAvailable: isPortalAvailable(),
      basename: PORTAL_BASENAME,
    });
  }, []);

  useEffect(() => {
    // Soft-release flag: outside "dynamic" nobody is auto-routed to the processor.
    if (loginLandingMode() !== "dynamic") return;
    // The fresh-login flag is the single source of truth for "once per login". It
    // is consumed only at the decision below, so a re-run before then just retries
    // (StrictMode double-invoke, or a dependency change mid-lookup) instead of
    // dropping the redirect with the flag already spent.
    if (!hasLoginLandingPending()) return;
    console.debug("[login-landing] pending", {
      isSignedIn,
      onAuthRoute: isAuthRoute(location.pathname),
      portalAvailable: isPortalAvailable(),
      landingView,
      path: location.pathname,
    });
    if (!isSignedIn) return;
    // Let the normal post-login navigation settle off the auth pages first.
    if (isAuthRoute(location.pathname)) return;

    let active = true;
    const settle = (goToProcessor: boolean) => {
      // Ignore a stale attempt cancelled by a re-run; the live run will decide.
      if (!active) return;
      consumeLoginLandingPending();
      setResolving(false);
      if (goToProcessor) navigate(PORTAL_BASENAME, { replace: true });
    };

    // A user who chose "editor" opts out, and no processor to route to -
    // decide synchronously, no lookup needed.
    if (landingView === "editor" || !isPortalAvailable()) {
      settle(false);
      return;
    }

    setResolving(true);
    void fetchLandsOnProcessor().then((goToProcessor) => {
      console.debug("[login-landing] decision", { goToProcessor });
      settle(goToProcessor);
    });

    return () => {
      active = false;
      setResolving(false);
    };
  }, [isSignedIn, landingView, location.pathname, navigate]);

  // Cover the editor while a would-be-processor lookup resolves, so a lead never
  // sees the editor flash before being sent to the processor.
  if (resolving) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z_INDEX_SIGN_IN_MODAL,
          background: "var(--c-surface)",
        }}
      >
        <LoadingFallback />
      </div>
    );
  }
  return null;
}

export default LoginLandingRedirect;
