import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  CLASSIFY_OPERATION,
  classificationDefaults,
  deleteProcessingFolder,
  fetchProcessingFolders,
  saveProcessingFolder,
  sweepProcessingFolder,
  type ProcessingFolder,
} from "@app/services/processingFolderApi";
import { useFolders } from "@app/contexts/FolderContext";
import { virtualFolderStorage } from "@app/services/virtualFolderStorage";
import { folderKind, type FolderRecord } from "@app/types/folder";
// The core stub declares the contract this shadows; import it from @core
// explicitly, since @app/hooks/useProcessingFolders resolves back to this file.
import type {
  ProcessingFolderState,
  ProcessingFoldersApi,
} from "@core/hooks/useProcessingFolders";

// Consumers import the contract's types from @app, which resolves here in
// builds that carry this shadow — so it must re-export what the stub declares.
export type {
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
 * A directory as a comparison key. A mount and its processing record are
 * created from the same picker string, but one side may carry a trailing
 * separator the other lost to trimming.
 */
function directoryKey(directory: string): string {
  return directory.trim().replace(/[/\\]+$/, "");
}

/**
 * Processing folders for the files page: which folders run a pipeline, and the actions to attach,
 * detach, or re-run one. The record's identity is kind-shaped — a server folder is matched by its
 * storage folderId, a mounted folder by the directory it mirrors — so the same folder row finds its
 * processing state whichever side of that split it lives on. Backed by
 * `/api/v1/processing-folders`, which composes the source + policy pair.
 *
 * Every mutation reloads rather than patching locally, so the list always reflects what the server
 * actually composed — and because the list is shared, every consumer sees it at once.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Virtual folders keep their processing config on their own record, so the
  // folder list is this hook's second system of record (and its refresh is how
  // a virtual mutation becomes visible).
  const { folders: allFolders, refresh: refreshFolders } = useFolders();

  useEffect(() => {
    void load();
  }, []);

  const recordFor = useCallback(
    (folder: FolderRecord): ProcessingFolder | undefined => {
      switch (folderKind(folder)) {
        case "local": {
          if (!folder.directory) return undefined;
          const key = directoryKey(folder.directory);
          return current.find(
            (record) =>
              record.directory && directoryKey(record.directory) === key,
          );
        }
        case "virtual":
          // Browser-owned folders process client-side; the server has no record of them.
          return undefined;
        default:
          return current.find((record) => record.folderId === folder.id);
      }
    },
    [current],
  );

  const stateFor = useCallback(
    (folder: FolderRecord): ProcessingFolderState | undefined => {
      if (folderKind(folder) === "virtual") {
        return folder.processing
          ? { id: folder.id as string, enabled: folder.processing.enabled }
          : undefined;
      }
      const record = recordFor(folder);
      return record ? { id: record.id, enabled: record.enabled } : undefined;
    },
    [recordFor],
  );

  const enabledFolderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const record of current) {
      if (record.enabled && record.folderId) ids.add(record.folderId);
    }
    // Virtual processing folders belong here too: with the AI engine off, the
    // browser-side classifier is their engine, and this set is what it scopes by.
    for (const folder of allFolders) {
      if (folderKind(folder) === "virtual" && folder.processing?.enabled) {
        ids.add(folder.id as string);
      }
    }
    return ids as ReadonlySet<string>;
  }, [current, allFolders]);

  const anyEnabled = useMemo(
    () =>
      current.some((record) => record.enabled) ||
      allFolders.some(
        (folder) =>
          folderKind(folder) === "virtual" && folder.processing?.enabled,
      ),
    [current, allFolders],
  );

  const enable = useCallback(
    async (folder: FolderRecord) => {
      switch (folderKind(folder)) {
        case "local":
          await saveProcessingFolder({
            directory: folder.directory ?? "",
            enabled: true,
            steps: [
              { operation: CLASSIFY_OPERATION, parameters: {}, assets: {} },
            ],
          });
          break;
        case "virtual":
          // Browser-owned: the config lives on the folder record and the
          // client-side engine picks it up from there. No server record.
          await virtualFolderStorage.setProcessing(folder.id, {
            enabled: true,
            steps: [{ operation: CLASSIFY_OPERATION, parameters: {} }],
          });
          await refreshFolders();
          return;
        default:
          await saveProcessingFolder(classificationDefaults(folder.id));
      }
      await load(true);
    },
    [refreshFolders],
  );

  const disable = useCallback(
    async (folder: FolderRecord) => {
      if (folderKind(folder) === "virtual") {
        await virtualFolderStorage.setProcessing(folder.id, null);
        await refreshFolders();
        return;
      }
      const existing = recordFor(folder);
      if (!existing) return;
      await deleteProcessingFolder(existing.id);
      await load(true);
    },
    [recordFor, refreshFolders],
  );

  const sweep = useCallback(
    async (folder: FolderRecord) => {
      if (folderKind(folder) === "virtual") {
        // The client-side engine is continuous: it processes the folder's
        // files as they appear, so there is no backlog for a sweep to start.
        return;
      }
      const existing = recordFor(folder);
      if (!existing) return;
      await sweepProcessingFolder(existing.id);
    },
    [recordFor],
  );

  return useMemo(
    () => ({ stateFor, enabledFolderIds, anyEnabled, enable, disable, sweep }),
    [stateFor, enabledFolderIds, anyEnabled, enable, disable, sweep],
  );
}

/** Reload the shared list — for a caller that created a folder outside these actions. */
export function refreshProcessingFolders(): Promise<void> {
  return load(true);
}
