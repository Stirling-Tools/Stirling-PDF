import type { ReactElement } from "react";

/**
 * Desktop inherits proprietary's App but must NOT ship the processor. Shadowing
 * the seam back to empty means the desktop bundle never references ProcessorApp,
 * so the processor chunk is not emitted (and @processor never has to resolve there).
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [];
}
