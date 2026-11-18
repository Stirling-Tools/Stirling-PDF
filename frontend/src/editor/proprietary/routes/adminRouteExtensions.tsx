import { lazy } from "react";
import type { ReactElement } from "react";
import { Navigate, Route, useLocation, useParams } from "react-router-dom";
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

/** A store id is `sp-` and eight characters; anything after it in a shared link is a cosmetic slug. */
const STORE_ID = /^sp-[0-9a-z]{8}/i;

/**
 * The public link a listing is shared by (DT-01), `/store/p/{storeId}[-slug]`. It points at the
 * store page inside the portal, which the gate opens to guests, so the URL can stay put if the
 * store ever moves.
 */
function StoreShareRedirect() {
  const { storeRef = "" } = useParams<{ storeRef: string }>();
  const storeId = (STORE_ID.exec(storeRef)?.[0] ?? storeRef).toLowerCase();
  return (
    <Navigate
      to={`${PORTAL_BASENAME}/store/${encodeURIComponent(storeId)}`}
      replace
    />
  );
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
      key="store-share"
      path="/store/p/:storeRef"
      element={<StoreShareRedirect />}
    />,
    <Route
      key="store"
      path="/store"
      element={<Navigate to={`${PORTAL_BASENAME}/store`} replace />}
    />,
    <Route
      key="account-link-callback"
      path="/account-link/callback"
      element={<ConnectCallback />}
    />,
  ];
}
