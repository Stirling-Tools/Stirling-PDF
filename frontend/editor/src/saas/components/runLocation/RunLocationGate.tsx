import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { normalizePath } from "@app/utils/pathUtils";
import { PublicRouteProviders } from "@app/components/PublicRouteProviders";
import { RunLocationChooser } from "@app/components/runLocation/RunLocationChooser";
import { hasChosenRunLocation } from "@app/components/runLocation/runLocationChosen";

// Links that finish a flow already in progress (an emailed sign-in, an OAuth
// redirect, a shared file). Interrupting them with the chooser in a fresh
// browser would strand the visitor mid-flow, or lose the token in the URL.
const FLOW_PATHS = [
  "/auth/callback",
  "/auth/reset",
  "/oauth/consent",
  "/link",
  "/account-link/callback",
];

export function bypassesRunLocation(pathname: string): boolean {
  const path = normalizePath(pathname);
  return FLOW_PATHS.includes(path) || path.startsWith("/share/");
}

/**
 * Layout route that shows the run-location chooser ahead of everything else,
 * auth included, until this browser has confirmed a choice once.
 */
export function RunLocationGate() {
  const { pathname } = useLocation();
  const [showChooser, setShowChooser] = useState(() => !hasChosenRunLocation());

  if (!showChooser || bypassesRunLocation(pathname)) {
    return <Outlet />;
  }

  return (
    <PublicRouteProviders>
      <RunLocationChooser onContinueInBrowser={() => setShowChooser(false)} />
    </PublicRouteProviders>
  );
}
