import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

const includePortal =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;

/** Whether this build ships the processor, and so has an app to switch to. */
export const HAS_PORTAL = includePortal;

const PortalApp = includePortal
  ? lazy(async () => {
      const m = await import("@portal/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

/**
 * Return leg of the account-link handshake, which Stirling redirects to with the admin's session in the URL fragment.
 */
const ConnectCallback = includePortal
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
