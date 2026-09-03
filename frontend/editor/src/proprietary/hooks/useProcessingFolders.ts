import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  CLASSIFY_OPERATION,
  classificationDefaults,
  deleteProcessingFolder,
  fetchMountedFiles,
  fetchProcessingFolderRuns,
  fetchProcessingFolders,
  saveProcessingFolder,
  sweepProcessingFolder,
  type ProcessingFolder,
} from "@app/services/processingFolderApi";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { deliverSweepResults } from "@app/services/processingRunDelivery";
import { folderKind, type FolderRecord } from "@app/types/folder";
// The core stub declares the contract this shadows; import it from @core
// explicitly, since @app/hooks/useProcessingFolders resolves back to this file.
import type {
  MountedFileState,
  ProcessingFolderState,
  ProcessingFoldersApi,
  ProcessingRunInfo,
} from "@core/hooks/useProcessingFolders";

// Consumers import the contract's types from @app, which resolves here in
// builds that carry this shadow — so it must re-export what the stub declares.
export type {
  MountedFileState,
  ProcessingFolderState,
  ProcessingFoldersApi,
  ProcessingRunInfo,
} from "@core/hooks/useProcessingFolders";

/**
 * One shared list for every consumer. The files page calls this hook once per folder row, on top of
 * the wizard, so per-instance state would mean one request per row and a mutation in one row
 * leaving the others stale until they remounted.
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
 * processing state whichever side of that split it lives on. Browser-owned virtual folders have no
 * server record and are never processing folders. Backed by `/api/v1/processing-folders`, which
 * composes the source + policy pair.
 *
 * Every mutation reloads rather than patching locally, so the list always reflects what the server
 * actually composed — and because the list is shared, every consumer sees it at once.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { addFiles } = useFileHandler();

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
          // Browser-owned folders live only in this browser; the server has no record of them.
          return undefined;
        default:
          return current.find((record) => record.folderId === folder.id);
      }
    },
    [current],
  );

  const stateFor = useCallback(
    (folder: FolderRecord): ProcessingFolderState | undefined => {
      const record = recordFor(folder);
      if (!record) return undefined;
      const outputDirectory = record.output?.["directory"];
      return {
        id: record.id,
        enabled: record.enabled,
        outputDirectory:
          typeof outputDirectory === "string" && outputDirectory
            ? outputDirectory
            : undefined,
      };
    },
    [recordFor],
  );

  const enabledFolderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const record of current) {
      if (record.enabled && record.folderId) ids.add(record.folderId);
    }
    return ids as ReadonlySet<string>;
  }, [current]);

  const anyEnabled = useMemo(
    () => current.some((record) => record.enabled),
    [current],
  );

  const enable = useCallback(
    async (folder: FolderRecord) => {
      // A paused pair resumes with its own steps and its history intact;
      // only a folder with no pair composes a fresh classification default.
      const paused = recordFor(folder);
      if (paused && !paused.enabled) {
        await saveProcessingFolder({
          id: paused.id,
          folderId: paused.folderId ?? undefined,
          directory: paused.directory ?? undefined,
          enabled: true,
          steps: paused.steps,
          output: paused.output,
        });
        await load(true);
        return;
      }
      switch (folderKind(folder)) {
        case "local": {
          const saved = await saveProcessingFolder({
            directory: folder.directory ?? "",
            enabled: true,
            steps: [
              { operation: CLASSIFY_OPERATION, parameters: {}, assets: {} },
            ],
          });
          // The create-time backlog sweep runs server-side; its results land
          // on disk, so pull them into the workbench as they settle — a
          // sweep whose results appear nowhere reads as nothing happening.
          if (saved.startedRuns > 0) {
            void deliverSweepResults(saved.id, saved.startedRuns, addFiles);
          }
          break;
        }
        case "virtual":
          return;
        default:
          await saveProcessingFolder(classificationDefaults(folder.id));
      }
      await load(true);
    },
    [recordFor, addFiles],
  );

  // Pause, never delete: the pair keeps its processed-history, so resuming
  // picks up only what is genuinely new instead of re-running everything.
  const disable = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return;
      await saveProcessingFolder({
        id: existing.id,
        folderId: existing.folderId ?? undefined,
        directory: existing.directory ?? undefined,
        enabled: false,
        steps: existing.steps,
        output: existing.output,
      });
      await load(true);
    },
    [recordFor],
  );

  const remove = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return;
      await deleteProcessingFolder(existing.id);
      await load(true);
    },
    [recordFor],
  );

  const listActiveRuns = useCallback(
    async (recordId: string): Promise<ProcessingRunInfo[]> => {
      const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];
      const runs = await fetchProcessingFolderRuns(recordId).catch(() => []);
      return runs
        .filter((run) => run.runId && !TERMINAL.includes(run.status))
        .map((run) => ({
          runId: run.runId!,
          fileName: run.fileName ?? null,
          currentStep: run.currentStep ?? 0,
          stepCount: run.stepCount ?? 0,
        }));
    },
    [],
  );

  const listFiles = useCallback(
    async (recordId: string): Promise<MountedFileState[]> =>
      (await fetchMountedFiles(recordId)).map((file) => ({
        name: file.name,
        state: file.state,
      })),
    [],
  );

  const sweep = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return;
      const outcome = await sweepProcessingFolder(existing.id);
      // A mount's results land on disk where nothing shows them; open them
      // into the workbench as they settle. A storage folder's results replace
      // its files in place, already visible where the user is looking.
      if (folderKind(folder) === "local" && outcome.runIds.length > 0) {
        void deliverSweepResults(existing.id, outcome.runIds.length, addFiles);
      }
    },
    [recordFor, addFiles],
  );

  return useMemo(
    () => ({
      stateFor,
      enabledFolderIds,
      anyEnabled,
      listActiveRuns,
      listFiles,
      enable,
      disable,
      remove,
      sweep,
    }),
    [
      stateFor,
      enabledFolderIds,
      anyEnabled,
      listActiveRuns,
      listFiles,
      enable,
      disable,
      remove,
      sweep,
    ],
  );
}

/** Reload the shared list — for a caller that created a folder outside these actions. */
export function refreshProcessingFolders(): Promise<void> {
  return load(true);
}
