import { lazy } from "react";
import type { ReactElement } from "react";
import { Route } from "react-router-dom";

// Lazy so the portal is its own chunk, never in the editor's initial bundle;
// only fetched when an admin navigates to /portal.
const PortalApp = lazy(async () => {
  const m = await import("@portal/PortalApp");
  return { default: m.PortalApp };
});

/**
 * The portal mounts as an admin-only route-set at /portal/*. Access is gated
 * inside PortalApp (its own AuthProvider + AuthGate, plus server enforcement),
 * so this just wires the lazy route into the editor's router.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [<Route key="portal" path="/portal/*" element={<PortalApp />} />];
}
