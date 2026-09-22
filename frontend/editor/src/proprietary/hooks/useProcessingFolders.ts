import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CLASSIFY_OPERATION,
  classificationDefaults,
  deleteProcessingFolder,
  fetchMountedFiles,
  fetchProcessingFolderRuns,
  fetchProcessingFolders,
  retryMountedFile,
  revertAllMountedFiles,
  revertMountedFile,
  saveProcessingFolder,
  sweepProcessingFolder,
  type ProcessingFolder,
} from "@app/services/processingFolderApi";
import { useFileHandler } from "@app/hooks/useFileHandler";
import { qk } from "@app/query/keys";
import {
  currentRunIds,
  deliverSweepResults,
} from "@app/services/processingRunDelivery";
import { folderKind, type FolderRecord } from "@app/types/folder";
import { directoryKey } from "@app/services/localFolderStorage";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { useProcessingFolders as useInertProcessingFolders } from "@core/hooks/useProcessingFolders";
// The core stub declares the contract this shadows; import it from @core
// explicitly, since @app/hooks/useProcessingFolders resolves back to this file.
import type {
  MountedFileState,
  ProcessingRecordSummary as CoreProcessingRecordSummary,
  ProcessingFolderState,
  ProcessingFoldersApi as CoreProcessingFoldersApi,
  ProcessingRunInfo,
} from "@core/hooks/useProcessingFolders";

// Consumers import the contract's types from @app, which resolves here — re-export them.
export type {
  MountedFileState,
  ProcessingFolderState,
  ProcessingRunInfo,
} from "@core/hooks/useProcessingFolders";

import type { WireRoutingRule } from "@app/policies/types";

/** Processing configuration retained when copying or reopening a template. */
export interface ProcessingRecordSummary extends CoreProcessingRecordSummary {
  categoryId?: string;
  outputIds?: string[];
  routingRules?: WireRoutingRule[];
}

export interface ProcessingFoldersApi extends Omit<
  CoreProcessingFoldersApi,
  "recordFor"
> {
  recordFor: (folder: FolderRecord) => ProcessingRecordSummary | undefined;
}

const EMPTY: ProcessingFolder[] = [];

/**
 * Processing folders for the files page. Record identity is kind-shaped: a server folder
 * matches by storage folderId, a mount by the directory it mirrors. Every mutation invalidates
 * rather than patching locally, so the list reflects what the server composed.
 *
 * One cache entry for every consumer: the files page calls this once per folder row, so a
 * per-instance read would mean a request per row. Invalidating rather than force-reloading
 * also collapses writes issued together into a single refresh.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  const queryClient = useQueryClient();
  const enabled = usePoliciesEnabled();
  const inert = useInertProcessingFolders();
  const { addFiles } = useFileHandler();
  const queryKey = qk.processingFolders();

  const {
    data: current = EMPTY,
    isPending: loading,
    error: loadFailure,
  } = useQuery({
    queryKey,
    queryFn: fetchProcessingFolders,
    // Only the proprietary build reads folders, and only once policy enforcement is on:
    // a signed-out or policies-off session has none to fetch.
    enabled,
    // Storage or login off, or unauthenticated: the files page works without these,
    // so a failure reports itself rather than retrying into the same wall.
    retry: false,
  });
  const error = loadFailure ? extractErrorMessage(loadFailure) : null;

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient],
  );

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

  const recordSummaryFor = useCallback(
    (folder: FolderRecord): ProcessingRecordSummary | undefined => {
      const record = recordFor(folder);
      if (!record) return undefined;
      return {
        id: record.id,
        enabled: record.enabled,
        categoryId:
          typeof record.output.categoryId === "string"
            ? record.output.categoryId
            : undefined,
        outputIds: record.outputIds,
        routingRules: record.routingRules,
        steps: record.steps.map((step) => ({
          operation: step.operation,
          parameters: step.parameters ?? {},
          assets: step.assets,
        })),
      };
    },
    [recordFor],
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
        // Captured before the resume so its delivery ignores the feed's older runs.
        const baseline = await currentRunIds(paused.id);
        await saveProcessingFolder({
          id: paused.id,
          folderId: paused.folderId ?? undefined,
          directory: paused.directory ?? undefined,
          enabled: true,
          steps: paused.steps,
          output: paused.output,
        });
        // Resume sweeps behind the response; pull a mount's on-disk results into the workbench.
        if (folderKind(folder) === "local") {
          void deliverSweepResults(paused.id, null, addFiles, {
            excludeRunIds: baseline,
          });
        }
        await reload();
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
          // The sweep runs behind the create response — no run count to wait on; pull
          // the on-disk results into the workbench as they settle.
          void deliverSweepResults(saved.id, null, addFiles);
          break;
        }
        case "virtual":
          return;
        default:
          await saveProcessingFolder(classificationDefaults(folder.id));
      }
      await reload();
    },
    [recordFor, addFiles, reload],
  );

  // Pause, never delete: the kept history means resuming picks up only what is new.
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
      await reload();
    },
    [recordFor, reload],
  );

  const remove = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return;
      await deleteProcessingFolder(existing.id);
      await reload();
    },
    [recordFor, reload],
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
        hasOriginal: file.hasOriginal,
      })),
    [],
  );

  const retryFile = useCallback(
    async (recordId: string, name: string) => retryMountedFile(recordId, name),
    [],
  );

  const revertFile = useCallback(
    async (recordId: string, name: string) => {
      await revertMountedFile(recordId, name);
      // Revert pauses the folder server-side; reload so the pause shows at once.
      await reload();
    },
    [reload],
  );

  const revertAll = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return undefined;
      const outcome = await revertAllMountedFiles(existing.id);
      // Revert pauses the folder server-side; reload so the pause shows at once.
      await reload();
      return outcome;
    },
    [recordFor],
  );

  const sweep = useCallback(
    async (folder: FolderRecord) => {
      const existing = recordFor(folder);
      if (!existing) return;
      const outcome = await sweepProcessingFolder(existing.id);
      // A mount's results land on disk where nothing shows them; a storage folder's
      // replace in place, already visible.
      if (folderKind(folder) === "local" && outcome.runIds.length > 0) {
        void deliverSweepResults(existing.id, outcome.runIds.length, addFiles, {
          includeRunIds: new Set(outcome.runIds),
        });
      }
    },
    [recordFor, addFiles],
  );

  return useMemo(
    () =>
      enabled
        ? {
            loading,
            loadError: error,
            stateFor,
            recordFor: recordSummaryFor,
            enabledFolderIds,
            anyEnabled,
            listActiveRuns,
            listFiles,
            retryFile,
            revertFile,
            revertAll,
            enable,
            disable,
            remove,
            sweep,
            refresh: reload,
          }
        : inert,
    [
      enabled,
      inert,
      loading,
      error,
      stateFor,
      recordSummaryFor,
      enabledFolderIds,
      anyEnabled,
      listActiveRuns,
      listFiles,
      retryFile,
      revertFile,
      revertAll,
      enable,
      disable,
      remove,
      sweep,
      reload,
    ],
  );
}
