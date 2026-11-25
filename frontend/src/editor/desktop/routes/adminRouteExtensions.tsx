import { lazy, type ReactElement } from "react";
import { Route } from "react-router-dom";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";

// Its own chunk: most sessions never open it.
const DesktopProcessor = lazy(async () => {
  const m = await import("@processor/DesktopProcessor");
  return { default: m.DesktopProcessor };
});

/**
 * The Processor beside the editor, as on the web. Desktop has no Enterprise
 * page, and links accounts in the app rather than through a callback page.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  return [
    <Route
      key="portal"
      path={`${PORTAL_BASENAME}/*`}
      element={<DesktopProcessor />}
    />,
  ];
}
