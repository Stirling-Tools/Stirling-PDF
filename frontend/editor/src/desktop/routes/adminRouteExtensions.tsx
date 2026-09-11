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
 * Warms the chunk the admin route-set lives in, so switching into it is not
 * gated on a network round-trip. No portal in this build, so nothing to warm.
 */
export async function preloadAdminRoutes(): Promise<void> {}
