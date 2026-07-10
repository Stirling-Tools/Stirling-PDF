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
  leadsRealTeam,
  loginLandingMode,
} from "@app/utils/loginLanding";

/**
 * On a fresh SaaS sign-in, sends real team leads to the processor and everyone
 * else to the editor. Fires once per login, guarded by a sessionStorage flag set
 * at login and consumed only once the destination is decided, so it never
 * hijacks later in-session navigation. Gated by the VITE_LOGIN_LANDING_MODE
 * soft-release flag ("dynamic" to enable).
 *
 * "Team lead" = leads a non-personal team (from /api/v1/team/my) - the
 * requirement's leads-vs-members axis, which correctly leaves solo/personal-team
 * users on the editor. Admins whose only team is personal, and ACL-only portal
 * grantees, are intentionally not auto-redirected (they reach the processor via
 * the app switcher); this keeps the signal client-side without a second
 * /auth/me round-trip and avoids sending personal-team users to an empty one.
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

  useEffect(() => {
    // Soft-release flag: outside "dynamic" nobody is auto-routed to the processor.
    if (loginLandingMode() !== "dynamic") return;
    // The fresh-login flag is the single source of truth for "once per login". It
    // is consumed only at the decision below, so a re-run before then just retries
    // (StrictMode double-invoke, or a dependency change mid-lookup) instead of
    // dropping the redirect with the flag already spent.
    if (!hasLoginLandingPending()) return;
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

    setResolving(true);
    void apiClient
      .get<Team[]>("/api/v1/team/my", { suppressErrorToast: true })
      .then((res) => settle(leadsRealTeam(res.data ?? [])))
      // No team data → treat as a member and stay on the editor.
      .catch(() => settle(false));

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
