import { useEffect, useState } from "react";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";
import {
  connectionModeService,
  type ConnectionMode,
} from "@app/services/connectionModeService";

/**
 * In local mode an unavailable tool still opens: its settings stay explorable
 * and the disabled run button offers sign-in to process in the cloud. Not
 * when the device is restricted to local processing — there the cloud isn't
 * an option.
 */
export function useUnavailableToolFallback(): boolean {
  const localOnly = useLocalProcessingOnly();
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(
    null,
  );

  useEffect(() => {
    void connectionModeService.getCurrentMode().then(setConnectionMode);
    return connectionModeService.subscribeToModeChanges((cfg) =>
      setConnectionMode(cfg.mode),
    );
  }, []);

  return !localOnly && connectionMode === "local";
}
