import { lazy, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Navigate, Route } from "react-router-dom";
import { fetchAppConfig } from "@app/api/config";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";

// The portal ships as a lazy chunk of the editor. It's included in dev (so it's
// always available to work on) and in production builds made with
// VITE_INCLUDE_PORTAL=true (set by -PbuildWithPortal in the JAR, and by the deploy
// GHA when the portal or AI layers change). Vite replaces the env with a literal at
// build time, so when it's off the dynamic import below is tree-shaken out and the
// portal chunk isn't emitted. PortalApp stays module-level so it isn't recreated on
// each render.
const includePortal =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;

const PortalApp = includePortal
  ? lazy(async () => {
      const m = await import("@portal/PortalApp");
      return { default: m.PortalApp };
    })
  : null;

/**
 * Runtime half of the gate. The chunk being bundled says nothing about the
 * server: an editor-only deployment (processor.enabled=false) must not mount it.
 * Config is fetched directly because this route sits above AppProviders.
 */
function PortalRoute() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAppConfig()
      .then((config) => {
        if (active) setEnabled(config.processorEnabled === true);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (enabled === null) return <LoadingFallback />;
  if (!enabled) return <Navigate to={EDITOR_BASENAME} replace />;
  return PortalApp ? <PortalApp /> : null;
}

/**
 * The portal mounts as an admin-only route-set at PORTAL_BASENAME (/processor/*).
 * Access is gated inside PortalApp (its own AuthProvider + AuthGate, plus server
 * enforcement), so this just wires the lazy route into the editor's router when
 * the portal is included in this build.
 */
export function getAdminRouteExtensions(): ReactElement[] {
  if (!PortalApp) return [];
  return [
    <Route
      key="portal"
      path={`${PORTAL_BASENAME}/*`}
      element={<PortalRoute />}
    />,
  ];
}
