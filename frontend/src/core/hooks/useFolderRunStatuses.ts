/**
 * Hook that derives per-folder run status from run state entries
 * 'done' automatically reverts to 'idle' after 5 minutes
 */

import { useState, useEffect, useRef } from "react";
import { SmartFolder, SmartFolderRunEntry } from "@app/types/smartFolders";
import { folderRunStateStorage } from "@app/services/folderRunStateStorage";
import { useWatchFolderStore } from "@app/contexts/WatchFolderStorageContext";

// IDB run-state events fire for both backends — the server backend mirrors writes to IDB
// (see serverBackend.addFolderRunEntries), so listening to the IDB event surface gives us
// live updates for both local and server-backed folders.

export type FolderRunStatus = "idle" | "processing" | "done";

const DONE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function deriveStatus(runs: SmartFolderRunEntry[]): FolderRunStatus {
  if (runs.some((r) => r.status === "processing")) return "processing";
  // Only treat recent runs (within TTL) as 'done' — avoids permanent green tick on old folders
  if (
    runs.some((r) => r.status === "processed" && r.processedAt != null && Date.now() - r.processedAt.getTime() < DONE_TTL_MS)
  )
    return "done";
  return "idle";
}

/** Latest processedAt timestamp across the runs, or 0 if no processed run is present. */
function latestProcessedAt(runs: SmartFolderRunEntry[]): number {
  let max = 0;
  for (const r of runs) {
    if (r.status === "processed" && r.processedAt) {
      const t = r.processedAt.getTime();
      if (t > max) max = t;
    }
  }
  return max;
}

export function useFolderRunStatuses(folders: SmartFolder[]): Record<string, FolderRunStatus> {
  const store = useWatchFolderStore();
  const [statuses, setStatuses] = useState<Record<string, FolderRunStatus>>({});
  // Timer per folder, keyed by the processedAt that anchored it. We extend the timer when a
  // newer processed run lands, so a flurry of completions doesn't revert "done" → "idle"
  // before the most recent one has its full TTL.
  const doneTimersRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; anchor: number }>>(new Map());
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  // Manage the done-timer for a single folder. Called on initial load and on every run-state
  // change for that folder.
  const scheduleRevert = (folderId: string, status: FolderRunStatus, anchor: number) => {
    const timers = doneTimersRef.current;
    const existing = timers.get(folderId);
    if (status !== "done") {
      if (existing) {
        clearTimeout(existing.timer);
        timers.delete(folderId);
      }
      return;
    }
    // status === "done" — start or extend the timer if anchor advanced.
    if (existing && existing.anchor >= anchor) return;
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      setStatuses((prev) => ({ ...prev, [folderId]: "idle" }));
      timers.delete(folderId);
    }, DONE_TTL_MS);
    timers.set(folderId, { timer, anchor });
  };

  useEffect(() => {
    if (folders.length === 0) return;

    const load = async () => {
      const results = await Promise.all(
        folders.map(async (folder) => {
          try {
            const runs = await store.getFolderRunState(folder.id);
            return [folder.id, deriveStatus(runs), latestProcessedAt(runs)] as const;
          } catch {
            return [folder.id, "idle" as FolderRunStatus, 0] as const;
          }
        }),
      );
      const newStatuses: Record<string, FolderRunStatus> = {};
      for (const [id, status, anchor] of results) {
        newStatuses[id] = status;
        scheduleRevert(id, status, anchor);
      }
      setStatuses(newStatuses);
    };

    load();
  }, [folders, store]);

  // Update individual folder status live when new run entries are appended
  useEffect(() => {
    return folderRunStateStorage.onRunStateChange((changedFolderId) => {
      if (!foldersRef.current.find((f) => f.id === changedFolderId)) return;
      store
        .getFolderRunState(changedFolderId)
        .then((runs) => {
          const status = deriveStatus(runs);
          scheduleRevert(changedFolderId, status, latestProcessedAt(runs));
          setStatuses((prev) => ({ ...prev, [changedFolderId]: status }));
        })
        .catch((err) => console.error("Failed to update run status:", err));
    });
  }, [store]);

  // Clean up timers on unmount
  useEffect(() => {
    const timers = doneTimersRef.current;
    return () => {
      timers.forEach(({ timer }) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return statuses;
}
