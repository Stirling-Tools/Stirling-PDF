import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { resolveRootTarget } from "@app/utils/loginLanding";

/** A decision, tagged with the visit it was made for so it can never go stale. */
interface Decision {
  visit: string;
  /** Where to send them, or null for "no role to route on - render the app". */
  target: string | null;
}

/**
 * Makes "/" a role-based router instead of a page: signed-in users are sent on
 * to the processor or the editor, with a per-user override in Settings and the
 * VITE_LOGIN_LANDING_MODE soft-release flag. Every other path renders the app
 * untouched.
 *
 * Wraps the app rather than being a route of its own, which buys two things:
 * - The editor never boots just to be redirected away from. Mounting the
 *   decision inside the app booted IndexedDB, the file context, onboarding and
 *   the license fetch on the way to the processor, then tore it all down - the
 *   visible "editor flashes, then jumps" glitch.
 * - Every other path shares one element position with the app, so navigating
 *   away from "/" is a plain render, not a remount.
 *
 * Signed-out visitors are NOT redirected: the app renders at "/" exactly as it
 * always has, and Landing owns that experience (self-hosted bounces to /login,
 * SaaS signs in inline, a downed backend gets the status screen). Only the app
 * knows which of those applies, and short-cutting to /login from here would
 * bounce a login-disabled or backend-down instance between the two.
 *
 * Note this only catches people who ARRIVE at "/". A fresh login resolves its
 * own destination (see resolveLandingPath) rather than bouncing through here,
 * so signing in never tears the app back down.
 *
 * Context-free by necessity, since it sits above the providers: apiClient
 * resolves its own auth token and the per-user override is read straight from
 * localStorage. Builds with no processor (core, desktop) use the pass-through
 * override.
 */
export function RootGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  // useLocation is already basename-relative, so this holds under subpath deploys.
  const isRoot = location.pathname === "/";
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    if (!isRoot) return;
    let active = true;
    void resolveRootTarget().then((target) => {
      // Ignore a stale lookup cancelled by a re-run; the live one decides.
      if (!active) return;
      console.debug("[root-gate] decision", { target });
      setDecision({ visit: location.key, target });
    });
    return () => {
      active = false;
    };
  }, [isRoot, location.key]);

  if (!isRoot) return <>{children}</>;
  // A decision from an earlier visit to "/" must not be reused: the answer can
  // change (a sign-in happened since), and acting on the old one would flash the
  // app before correcting itself.
  if (decision?.visit !== location.key) return <LoadingFallback />;
  if (decision.target === null) return <>{children}</>;
  return <Navigate to={decision.target} replace />;
}

export default RootGate;
