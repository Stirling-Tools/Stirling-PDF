import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import apiClient from "@app/services/apiClient";
import { useAuth } from "@app/auth/UseSession";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { isAuthRoute } from "@app/utils/pathUtils";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { Z_INDEX_SIGN_IN_MODAL } from "@app/styles/zIndex";
import type { Team } from "@app/contexts/SaaSTeamContext";
import {
  consumeLoginLandingPending,
  hasLoginLandingPending,
  isPortalAvailable,
  landsOnProcessor,
  loginLandingMode,
} from "@app/utils/loginLanding";

/**
 * On a fresh SaaS sign-in, sends real team leads to the processor and everyone
 * else to the editor. Fires once per login, guarded by a sessionStorage flag set
 * at login and consumed only once the destination is decided, so it never
 * hijacks later in-session navigation. Gated by the VITE_LOGIN_LANDING_MODE
 * soft-release flag ("dynamic" to enable).
 *
 * Processor-bound = an admin, or a leader of a non-personal team (see
 * landsOnProcessor). Members and solo/personal-team users stay on the editor.
 *
 * While the lookup is in flight for a would-be processor user, a full-screen
 * loader is shown so the editor never flashes before the redirect resolves.
 */
export function SaasLoginLandingRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, isAnonymous } = useAuth();
  const { preferences } = usePreferences();
  // A settled, non-anonymous session. Depend on this boolean rather than the
  // session object so the effect - and its in-flight lookup - is not torn down
  // by the identity churn of setSession() firing on every Supabase auth event.
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
    // From here a fresh-login redirect is pending; log the gate state so a live
    // instance shows exactly what blocked (or allowed) the redirect.
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

    // Members always stay on the editor, and a lead who chose "editor" opts out -
    // decide synchronously, no lookup needed.
    if (landingView === "editor" || !isPortalAvailable()) {
      settle(false);
      return;
    }

    // Admin comes from the backend role (/auth/me); non-personal team leadership
    // from /team/my. Either one lands the user on the processor.
    setResolving(true);
    void Promise.allSettled([
      apiClient.get<{ user?: { role?: string } }>("/api/v1/auth/me", {
        suppressErrorToast: true,
      }),
      apiClient.get<Team[]>("/api/v1/team/my", { suppressErrorToast: true }),
    ]).then(([meRes, teamsRes]) => {
      const role =
        meRes.status === "fulfilled" ? meRes.value.data?.user?.role : null;
      const teams =
        teamsRes.status === "fulfilled" ? (teamsRes.value.data ?? []) : [];
      const goToProcessor = landsOnProcessor(role, teams);
      console.debug("[login-landing] decision", {
        role,
        teamCount: teams.length,
        meOk: meRes.status === "fulfilled",
        teamsOk: teamsRes.status === "fulfilled",
        goToProcessor,
      });
      // On any lookup failure the fields default to member → stay on the editor.
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
          background: "var(--bg-surface)",
        }}
      >
        <LoadingFallback />
      </div>
    );
  }
  return null;
}

export default SaasLoginLandingRedirect;
