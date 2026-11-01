import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";
import { HAS_PORTAL } from "@editor/routes/hasPortal";

const PortalApp = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@processor/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

const ProcurementRedirect = HAS_PORTAL
  ? lazy(async () => {
      const m =
        await import("@processor/components/procurement/ProcurementRedirect");
      return { default: m.ProcurementRedirect };
    })
  : null;

/**
 * Return leg of the account-link handshake, which Stirling redirects to with the admin's session in the URL fragment.
 */
const ConnectCallback = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@processor/views/ConnectCallback");
      return { default: m.default };
    })
  : null;

/** The portal mounts as an admin-only route-set at PORTAL_BASENAME (/processor/*). */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!PortalApp || !ConnectCallback || !ProcurementRedirect) return [];
  return [
    <Route
      key="procurement"
      path="/procurement"
      element={<ProcurementRedirect />}
    />,
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
