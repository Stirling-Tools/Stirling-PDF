import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

// The portal ships as a lazy chunk of the editor. It's included in dev (so it's
// always available to work on) and in production builds made with
// VITE_INCLUDE_PORTAL=true (set by -PbuildWithPortal in the JAR, and by the deploy
// GHA when the portal or AI layers change). Vite replaces the env with a literal at
// build time, so when it's off the dynamic import below is tree-shaken out and the
// portal chunk isn't emitted. PortalApp stays module-level so it isn't recreated on
// each render.
const includePortal =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;

const PortalApp = includePortal
  ? lazy(async () => {
      const m = await import("@portal/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

/**
 * Return leg of the account-link handshake, which Stirling redirects to with the
 * admin's session in the URL fragment.
 *
 * <p>Sits here rather than in the editor's own route list because it is a portal
 * view: importing it there would pull the portal chunk into the main bundle, which
 * is the thing this seam exists to avoid. It is also why core and desktop need no
 * {@code @portal/*} path mapping — their stubs return nothing.
 *
 * <p>Top level rather than under PORTAL_BASENAME so the callback URL the portal
 * advertises is just origin plus this path, with no second basename to compose.
 */
const ConnectCallback = includePortal
  ? lazy(async () => {
      const m = await import("@portal/views/ConnectCallback");
      return { default: m.default };
    })
  : null;

/**
 * The portal mounts as an admin-only route-set at PORTAL_BASENAME (/processor/*).
 * Access is gated inside PortalApp (its own AuthProvider + AuthGate, plus server
 * enforcement), so this just wires the lazy route into the editor's router when
 * the portal is included in this build.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!PortalApp || !ConnectCallback) return [];
  return [
    <Route
      key="portal"
      path={`${PORTAL_BASENAME}/*`}
      element={<PortalApp />}
    />,
    <Route
      key="account-link-callback"
      path="/account-link/callback"
      element={<ConnectCallback />}
    />,
  ];
}
