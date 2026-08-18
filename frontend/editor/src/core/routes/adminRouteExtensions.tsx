import type { ReactElement } from "react";

/**
 * Admin-only route-set contributed by higher layers (the portal). The OSS core
 * build ships none, so this stub returns an empty list and the portal chunk is
 * never referenced in the core bundle.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}

/**
 * Warms the chunk the admin route-set lives in, so switching into it is not
 * gated on a network round-trip. No portal in this build, so nothing to warm.
 */
export async function preloadAdminRoutes(): Promise<void> {}
