import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  classificationDefaults,
  deleteProcessingFolder,
  fetchProcessingFolders,
  saveProcessingFolder,
  sweepProcessingFolder,
  type ProcessingFolder,
} from "@app/services/processingFolderApi";
// The core stub declares the contract this shadows; import it from @core
// explicitly, since @app/hooks/useProcessingFolders resolves back to this file.
import type {
  ProcessingFolderState,
  ProcessingFoldersApi,
} from "@core/hooks/useProcessingFolders";

/**
 * One shared list for every consumer. The files page calls this hook once per folder row, on top of
 * the wizard and the classification loop, so per-instance state would mean one request per row and
 * a mutation in one row leaving the others stale until they remounted.
 */
let folders: ProcessingFolder[] = [];
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot identity only changes when the list is replaced, so consumers re-render on real news. */
function getSnapshot(): ProcessingFolder[] {
  return folders;
}

/**
 * Load the list, sharing one request across concurrent callers. `force` bypasses an existing
 * in-flight read so a mutation always observes its own effect.
 */
function load(force = false): Promise<void> {
  if (inFlight && !force) return inFlight;
  const request = fetchProcessingFolders()
    .then((next) => {
      folders = next;
    })
    .catch(() => {
      // Storage or login disabled, or not authenticated: nothing to show, and the files page
      // still works without processing folders.
      folders = [];
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
      listeners.forEach((listener) => listener());
    });
  inFlight = request;
  return request;
}

/**
 * Processing folders for the files page: which folders run a pipeline, which are mounted from disk,
 * and the actions to attach, detach, or re-run one. Backed by `/api/v1/processing-folders`, which
 * composes the source + policy pair.
 *
 * Every mutation reloads rather than patching locally, so the list always reflects what the server
 * actually composed — and because the list is shared, every consumer sees it at once.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void load();
  }, []);

  // Storage-backed folders key by the storage folder they mark; disk-backed ones have no storage
  // folder at all and are surfaced as mounted entries instead.
  const byFolderId = useMemo(() => {
    const map = new Map<string, ProcessingFolderState>();
    for (const folder of current) {
      if (!folder.folderId) continue;
      map.set(folder.folderId, {
        id: folder.id,
        enabled: folder.enabled,
        name: folder.name,
      });
    }
    return map;
  }, [current]);

  const mounted = useMemo(
    () =>
      current
        .filter((folder) => Boolean(folder.directory))
        .map((folder) => ({
          id: folder.id,
          enabled: folder.enabled,
          directory: folder.directory,
          // "Processing folder: Downloads" is the record's name; the folder is just "Downloads".
          name: folder.name.replace(/^Processing folder:\s*/, ""),
        })),
    [current],
  );

  const enable = useCallback(async (folderId: string) => {
    await saveProcessingFolder(classificationDefaults(folderId));
    await load(true);
  }, []);

  const disable = useCallback(
    async (folderId: string) => {
      const existing = current.find((f) => f.folderId === folderId);
      if (!existing) return;
      await deleteProcessingFolder(existing.id);
      await load(true);
    },
    [current],
  );

  const sweep = useCallback(
    async (folderId: string) => {
      const existing = current.find((f) => f.folderId === folderId);
      if (!existing) return;
      await sweepProcessingFolder(existing.id);
    },
    [current],
  );

  return { byFolderId, mounted, enable, disable, sweep };
}

/** Reload the shared list — for a caller that created a folder outside these actions. */
export function refreshProcessingFolders(): Promise<void> {
  return load(true);
}
