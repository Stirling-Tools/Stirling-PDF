import { useEffect, useState } from "react";
import type { DiskFileState } from "@app/components/filesPage/FileGrid";
import { useProcessingFolders } from "@app/hooks/useProcessingFolders";

/** Polls the open processing folder; cancels stale replies when the folder changes. */
export function useFolderFileStates(
  processingRecordId: string | undefined,
  enabled: boolean,
) {
  const { listFiles } = useProcessingFolders();
  const [fileStates, setFileStates] = useState<Map<string, DiskFileState>>(
    new Map(),
  );
  const [revertables, setRevertables] = useState<ReadonlySet<string>>(
    new Set(),
  );
  useEffect(() => {
    if (!enabled || !processingRecordId) {
      setFileStates((prev) => (prev.size === 0 ? prev : new Map()));
      setRevertables((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const files = await listFiles(processingRecordId).catch(() => []);
      if (!cancelled) {
        setFileStates(new Map(files.map((f) => [f.name, f.state])));
        setRevertables(
          new Set(files.filter((f) => f.hasOriginal).map((f) => f.name)),
        );
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, processingRecordId, listFiles]);

  return { fileStates, setFileStates, revertables, setRevertables };
}
