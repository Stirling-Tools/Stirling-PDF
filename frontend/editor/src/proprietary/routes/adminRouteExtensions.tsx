import { lazy } from "react";
import type { ReactElement } from "react";
import { Navigate, Route, useParams } from "react-router-dom";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { HAS_PORTAL } from "@app/routes/hasPortal";

const PortalApp = HAS_PORTAL
  ? lazy(async () => {
      const m = await import("@portal/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

const ProcurementRedirect = HAS_PORTAL
  ? lazy(async () => {
      const m =
        await import("@portal/components/procurement/ProcurementRedirect");
      return { default: m.ProcurementRedirect };
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
