import type { ReactElement } from "react";

/**
 * Prototypes resolves @app/* through proprietary, but maps no @portal/* of its
 * own - it ships no portal. Shadowing the seam back to empty keeps proprietary's
 * copy (and its @portal import) out of this variant's graph entirely.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}

/**
 * Warms the chunk the admin route-set lives in, so switching into it is not
 * gated on a network round-trip. No portal in this build, so nothing to warm.
 */
export async function preloadAdminRoutes(): Promise<void> {}
