import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { normalizePath } from "@editor/utils/pathUtils";
import { PublicRouteProviders } from "@editor/components/PublicRouteProviders";
import { RunLocationChooser } from "@editor/components/runLocation/RunLocationChooser";
import { hasChosenRunLocation } from "@editor/components/runLocation/runLocationChosen";
import { ENTERPRISE_PATH } from "@editor/portal/components/procurement/enterprisePath";

// Links that finish a flow already in progress (an emailed sign-in, an OAuth
// redirect, a shared file). Interrupting them with the chooser in a fresh
// browser would strand the visitor mid-flow, or lose the token in the URL.
// The Enterprise page is a landing link from campaigns and sales replies, and
// asks where Stirling will be deployed itself.
const FLOW_PATHS = [
  "/auth/callback",
  "/auth/reset",
  "/oauth/consent",
  "/link",
  "/account-link/callback",
  ENTERPRISE_PATH,
];

// Signing in from the Enterprise page detours through these, naming it as `next`.
const AUTH_PATHS = ["/login", "/signup"];

export function bypassesRunLocation(pathname: string, search = ""): boolean {
  const path = normalizePath(pathname);
  if (FLOW_PATHS.includes(path) || path.startsWith("/share/")) return true;
  const next = new URLSearchParams(search).get("next");
  return (
    AUTH_PATHS.includes(path) && next?.split(/[?#]/)[0] === ENTERPRISE_PATH
  );
}

/**
 * Layout route that shows the run-location chooser ahead of everything else,
 * auth included, until this browser has confirmed a choice once.
 */
export function RunLocationGate() {
  const { pathname, search } = useLocation();
  const [showChooser, setShowChooser] = useState(() => !hasChosenRunLocation());

  if (!showChooser || bypassesRunLocation(pathname, search)) {
    return <Outlet />;
  }

  return (
    <PublicRouteProviders>
      <RunLocationChooser onContinueInBrowser={() => setShowChooser(false)} />
    </PublicRouteProviders>
  );
}
