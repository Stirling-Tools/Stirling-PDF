import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { connectionModeService } from "@app/services/connectionModeService";
import type { ConnectionMode } from "@app/services/connectionModeService";
import { useServerFolderBlock as useCoreServerFolderBlock } from "@core/hooks/useServerFolderBlock";

/** Desktop's blocker speaks in connection modes. */
export function useServerFolderBlock(): string | null {
  const { t } = useTranslation();
  const coreReason = useCoreServerFolderBlock();
  // Seeded from the cache so a remount answers on its first frame; the effect covers
  // the first-ever load and later mode switches.
  const [mode, setMode] = useState<ConnectionMode | null>(() =>
    connectionModeService.getCachedMode(),
  );
  useEffect(() => {
    let mounted = true;
    void connectionModeService.getCurrentMode().then((current) => {
      if (mounted) setMode(current);
    });
    const unsubscribe = connectionModeService.subscribeToModeChanges((config) =>
      setMode(config.mode),
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  // While the mode is unknown (first-ever load), fail closed with the same message: in
  // any mode where the item would be blocked, signing in or connecting a server IS the
  // way out — unlike the core reasons, which in local mode point at a storage setting
  // that doesn't exist.
  if (mode === "local" || mode === null) {
    return t(
      "filesPage.serverFolderNeedsConnection",
      "Sign in to Stirling Cloud or connect a self-hosted server to use server folders.",
    );
  }
  return coreReason;
}
