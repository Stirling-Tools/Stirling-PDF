import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { normalizePath } from "@editor/utils/pathUtils";
import { PublicRouteProviders } from "@editor/components/PublicRouteProviders";
import { RunLocationChooser } from "@editor/components/runLocation/RunLocationChooser";
import { hasChosenRunLocation } from "@editor/components/runLocation/runLocationChosen";
import { TEAM_PATH } from "@editor/routes/teamPath";
import { nextPathOf } from "@editor/routes/authShared/nextPath";
import {
  ENTERPRISE_PATH,
  LEGACY_ENTERPRISE_PATH,
} from "@editor/portal/components/procurement/enterprisePath";

// Landing links from campaigns and sales replies. Team is bought for a Stirling
// account, so it settles where Stirling runs on its own; the Enterprise page
// asks where Stirling will be deployed itself.
const LANDING_PATHS = [TEAM_PATH, ENTERPRISE_PATH, LEGACY_ENTERPRISE_PATH];

// Links that finish a flow already in progress (an emailed sign-in, an OAuth
// redirect, a shared file). Interrupting them with the chooser in a fresh
// browser would strand the visitor mid-flow, or lose the token in the URL.
const FLOW_PATHS = [
  "/auth/callback",
  "/auth/reset",
  "/oauth/consent",
  "/link",
  "/account-link/callback",
  ...LANDING_PATHS,
];

// Signing in from a landing link or a shared file detours through these, naming
// it as `next` (or `from`).
const AUTH_PATHS = ["/login", "/signup"];

function authDestination(pathname: string, search: string): string | undefined {
  if (!AUTH_PATHS.includes(normalizePath(pathname))) return undefined;
  const params = new URLSearchParams(search);
  return nextPathOf(params.get("next") ?? params.get("from"));
}

function isShareLink(path: string): boolean {
  return path.startsWith("/share/");
}

/** On a landing link, or signing in on the way to one. */
function isLanding(pathname: string, search: string): boolean {
  if (LANDING_PATHS.includes(normalizePath(pathname))) return true;
  const destination = authDestination(pathname, search);
  return destination !== undefined && LANDING_PATHS.includes(destination);
}

export function bypassesRunLocation(pathname: string, search = ""): boolean {
  const path = normalizePath(pathname);
  if (FLOW_PATHS.includes(path) || isShareLink(path)) return true;
  const destination = authDestination(pathname, search);
  if (destination !== undefined && isShareLink(destination)) return true;
  return isLanding(pathname, search);
}

/**
 * Layout route that shows the run-location chooser ahead of everything else,
 * auth included, until this browser has confirmed a choice once.
 */
export function RunLocationGate() {
  const { pathname, search } = useLocation();
  const [showChooser, setShowChooser] = useState(() => !hasChosenRunLocation());
  // A landing link hands the visitor on into the app (checkout, the editor), so it settles the
  // question for the rest of the visit, not just its own page.
  if (showChooser && isLanding(pathname, search)) setShowChooser(false);

  if (!showChooser || bypassesRunLocation(pathname, search)) {
    return <Outlet />;
  }

  return (
    <PublicRouteProviders>
      <RunLocationChooser onContinueInBrowser={() => setShowChooser(false)} />
    </PublicRouteProviders>
  );
}
