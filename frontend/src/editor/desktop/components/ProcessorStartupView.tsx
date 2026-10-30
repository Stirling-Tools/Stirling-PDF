import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { stripBasePath } from "@editor/constants/app";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useConnectedServerState } from "@editor/hooks/useConnectedServer";
import { EDITOR_BASENAME } from "@editor/routes/editorBasename";
import { PORTAL_BASENAME } from "@editor/routes/portalBasename";

// Once per launch, so going back to the editor afterwards never bounces.
let decided = false;

/**
 * Applies "Processor" as the default view on launch: from the app's front door
 * on a fresh start, with a server connected. Access is the Processor's own
 * gate to check, which sends an account without it back to the editor.
 */
export function ProcessorStartupView() {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const server = useConnectedServerState();

  useEffect(() => {
    if (decided || !server.settled) return;
    decided = true;
    if (preferences.defaultStartupView !== "processor" || !server.connected) {
      return;
    }
    const navigation = performance.getEntriesByType?.("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "reload") return;
    if (stripBasePath(window.location.pathname) !== EDITOR_BASENAME) return;
    navigate(PORTAL_BASENAME, { replace: true });
  }, [
    server.settled,
    server.connected,
    preferences.defaultStartupView,
    navigate,
  ]);

  return null;
}
