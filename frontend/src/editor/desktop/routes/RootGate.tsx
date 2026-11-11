import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingFallback } from "@editor/components/shared/LoadingFallback";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useConnectedServerState } from "@editor/hooks/useConnectedServer";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";

// Once per launch: the editor lives at "/" here, so coming back to it must never bounce.
let decided = false;

function isReload(): boolean {
  const navigation = performance.getEntriesByType?.("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return navigation?.type === "reload";
}

/**
 * Desktop override: applies "Processor" as the default view on launch, before
 * the editor boots, as the web's RootGate routes "/" for accounts that opted
 * in. Only on a fresh start at the app's front door with a server connected;
 * the Processor's own gate sends an account without access back.
 */
export function RootGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { preferences } = usePreferences();
  const server = useConnectedServerState();
  const wantsProcessor =
    !decided &&
    pathname === EDITOR_BASENAME &&
    preferences.defaultStartupView === "processor" &&
    !isReload();
  const settled = !wantsProcessor || server.settled;

  useEffect(() => {
    if (settled) decided = true;
  }, [settled]);

  if (!wantsProcessor) return <>{children}</>;
  if (!server.settled) return <LoadingFallback />;
  if (server.connected) return <Navigate to={PORTAL_BASENAME} replace />;
  return <>{children}</>;
}

export default RootGate;
