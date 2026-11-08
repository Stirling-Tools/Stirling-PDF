import { lazy } from "react";
import type { ReactElement } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";
import { HAS_PORTAL } from "@editor/routes/hasPortal";
import { NoAppChrome } from "@editor/components/layout/NoAppChrome";
import {
  ENTERPRISE_PATH,
  LEGACY_ENTERPRISE_PATH,
} from "@editor/portal/components/procurement/enterprisePath";

const PortalApp = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@processor/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

/** The Enterprise page reads like a website, so it carries none of the app's chrome. */
const EnterpriseApp = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@processor/EnterpriseApp");
      return { default: m.EnterpriseApp };
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

/** Old Enterprise links, kept working with whatever they carry (?source=sales). */
function LegacyEnterpriseRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={`${ENTERPRISE_PATH}${search}${hash}`} replace />;
}

/** The portal mounts as an admin-only route-set at PORTAL_BASENAME (/processor/*). */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!PortalApp || !ConnectCallback || !EnterpriseApp) return [];
  return [
    <Route key="enterprise" element={<NoAppChrome />}>
      <Route path={ENTERPRISE_PATH} element={<EnterpriseApp />} />
    </Route>,
    <Route
      key="enterprise-legacy"
      path={LEGACY_ENTERPRISE_PATH}
      element={<LegacyEnterpriseRedirect />}
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
