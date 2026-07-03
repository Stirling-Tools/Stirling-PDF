import type { ReactElement } from "react";

/**
 * Admin-only route-set contributed by higher layers (the portal). The OSS core
 * build ships none, so this stub returns an empty list and the portal chunk is
 * never referenced in the core bundle.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}
