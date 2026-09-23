import { useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiskFileState } from "@app/components/filesPage/FileGrid";
import {
  useProcessingFolders,
  type MountedFileState,
} from "@app/hooks/useProcessingFolders";
import { qk } from "@app/query/keys";

const PROCESSING_FILES_POLL_MS = 3000;
const PROCESSING_FILES_FAILURE_LIMIT = 3;
const EMPTY_FILE_STATES: ReadonlyMap<string, DiskFileState> = new Map();
const EMPTY_REVERTABLES: ReadonlySet<string> = new Set();

/**
 * Shares processing states between library views; polling pauses while the browser tab is hidden.
 * Files stay locked until done or failed; three failed polls release locks until status recovers.
 */
export function useFolderFileStates(
  processingRecordId: string | undefined,
  enabled: boolean,
) {
  const { listFiles } = useProcessingFolders();
  const queryClient = useQueryClient();
  const processingFilesKey = qk.processingFolderFiles(processingRecordId ?? "");
  // Only properties a quiet poll leaves alone: `data` keeps its identity under
  // structural sharing, `isError` moves on a transition and `errorUpdateCount`
  // on a failure. Reading `dataUpdatedAt` or `status` here re-rendered every
  // view on the page every 3s to say nothing had changed.
  const {
    data: processingFiles,
    isError: processingPollFailed,
    errorUpdateCount,
  } = useQuery({
    queryKey: processingFilesKey,
    queryFn: () => listFiles(processingRecordId!),
    enabled: enabled && Boolean(processingRecordId),
    refetchInterval: PROCESSING_FILES_POLL_MS,
    retry: false,
  });

  const activeProcessingKey = enabled ? (processingRecordId ?? "") : "";
  // Failures since the last good poll, held as a baseline rather than counted
  // into state, so tracking them costs no render of its own.
  const failuresBefore = useRef({ key: "", errors: 0 });
  if (failuresBefore.current.key !== activeProcessingKey) {
    failuresBefore.current = {
      key: activeProcessingKey,
      errors: errorUpdateCount,
    };
  } else if (!processingPollFailed) {
    failuresBefore.current.errors = errorUpdateCount;
  }
  const processingStatesUnavailable =
    Boolean(activeProcessingKey) &&
    errorUpdateCount - failuresBefore.current.errors >=
      PROCESSING_FILES_FAILURE_LIMIT;

  const fileStates = useMemo(
    () =>
      processingFiles
        ? new Map(processingFiles.map((file) => [file.name, file.state]))
        : EMPTY_FILE_STATES,
    [processingFiles],
  );
  const revertables = useMemo(
    () =>
      processingFiles
        ? new Set(
            processingFiles
              .filter((file) => file.hasOriginal)
              .map((file) => file.name),
          )
        : EMPTY_REVERTABLES,
    [processingFiles],
  );
  const patchProcessingFile = useCallback(
    (name: string, patch: Partial<MountedFileState>) =>
      queryClient.setQueryData<MountedFileState[]>(
        processingFilesKey,
        (previous) =>
          previous?.map((file) =>
            file.name === name ? { ...file, ...patch } : file,
          ),
      ),
    [queryClient, processingFilesKey],
  );

  const processingLockedFor = useCallback(
    (name: string): boolean => {
      if (!activeProcessingKey || processingStatesUnavailable) return false;
      const state = fileStates.get(name);
      return state !== "done" && state !== "failed";
    },
    [activeProcessingKey, processingStatesUnavailable, fileStates],
  );

  return {
    fileStates,
    revertables,
    patchProcessingFile,
    processingLockedFor,
    processingStatesUnavailable,
  };
}
