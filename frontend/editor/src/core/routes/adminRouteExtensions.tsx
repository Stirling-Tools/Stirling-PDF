import type { ReactElement } from "react";

/**
 * Admin-only route-set contributed by higher layers (the processor). The OSS core
 * build ships none, so this stub returns an empty list and the processor chunk is
 * never referenced in the core bundle.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}
