import type { ReactNode } from "react";

/**
 * Extension point for an in-window title-bar strip. A layer that has one shadows
 * this to render the strip above the app and supply its portal slots; the
 * default renders the app body unchanged.
 */
export function TitleBarChrome({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
