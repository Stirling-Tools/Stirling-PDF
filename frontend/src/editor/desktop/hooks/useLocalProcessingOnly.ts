import { useEffect, useState } from "react";
import { connectionModeService } from "@app/services/connectionModeService";

/** Hides off-device features until the native policy is known, including on read errors. */
export function useLocalProcessingOnly(): boolean {
  const [restricted, setRestricted] = useState(
    () => connectionModeService.getCachedLocalProcessingOnly() ?? true,
  );
  useEffect(() => {
    let mounted = true;
    void connectionModeService
      .getCurrentConfig()
      .then((config) => {
        if (mounted) setRestricted(Boolean(config.local_processing_only));
      })
      .catch(() => {
        if (mounted) setRestricted(true);
      });
    const unsubscribe = connectionModeService.subscribeToModeChanges((config) =>
      setRestricted(Boolean(config.local_processing_only)),
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  return restricted;
}
