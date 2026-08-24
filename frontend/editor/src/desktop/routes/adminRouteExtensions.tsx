import type { ReactElement } from "react";

/**
 * Desktop inherits proprietary's App but must NOT ship the portal. Shadowing
 * the seam back to empty means the desktop bundle never references PortalApp,
 * so the portal chunk is not emitted (and @portal never has to resolve there).
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}

/**
 * No portal in this build, so nothing to fetch. Exists so the app-switch path can
 * call it without knowing which layer it is in.
 */
export function preloadPortal(): Promise<void> {
  return Promise.resolve();
}
