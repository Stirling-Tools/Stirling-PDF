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
 * No portal in this build, so nothing to fetch. Exists so the app-switch path can
 * call it without knowing which layer it is in.
 */
export function preloadPortal(): Promise<void> {
  return Promise.resolve();
}
