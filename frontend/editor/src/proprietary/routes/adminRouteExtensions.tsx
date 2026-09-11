import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { HAS_PORTAL } from "@app/routes/hasPortal";

const PortalApp = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@portal/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

/**
 * Return leg of the account-link handshake, which Stirling redirects to with the admin's session in the URL fragment.
 */
const ConnectCallback = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@portal/views/ConnectCallback");
      return { default: m.default };
    })
  : null;

/** The portal mounts as an admin-only route-set at PORTAL_BASENAME (/processor/*). */
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

/**
 * Warms the portal chunk so switching into it is not gated on a network
 * round-trip. Called as the outgoing app starts animating out, which is enough
 * lead time for the fetch on a warm connection. Failures are ignored: the lazy
 * route retries the same import and Suspense covers the wait.
 */
export async function preloadAdminRoutes(): Promise<void> {
  if (!HAS_PORTAL) return;
  try {
    await import("@portal/PortalApp");
  } catch {
    /* the route's own import reports it */
  }
}
