import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const {
    data: processingFiles,
    dataUpdatedAt: processingFilesUpdatedAt,
    errorUpdatedAt: processingFilesErrorAt,
    status: processingFilesStatus,
  } = useQuery({
    queryKey: processingFilesKey,
    queryFn: () => listFiles(processingRecordId!),
    enabled: enabled && Boolean(processingRecordId),
    refetchInterval: PROCESSING_FILES_POLL_MS,
    retry: false,
  });

  const activeProcessingKey = enabled ? (processingRecordId ?? "") : "";
  const [processingPollFailures, setProcessingPollFailures] = useState({
    key: "",
    count: 0,
  });
  const processingPollEvent = useRef({ key: "", updatedAt: 0 });
  useEffect(() => {
    const key = activeProcessingKey;
    if (processingPollEvent.current.key !== key) {
      processingPollEvent.current = { key, updatedAt: 0 };
      setProcessingPollFailures({ key, count: 0 });
    }
    if (!key) return;

    const updatedAt =
      processingFilesStatus === "error"
        ? processingFilesErrorAt
        : processingFilesUpdatedAt;
    if (!updatedAt || updatedAt <= processingPollEvent.current.updatedAt)
      return;

    processingPollEvent.current.updatedAt = updatedAt;
    setProcessingPollFailures((failures) => ({
      key,
      count:
        processingFilesStatus === "error"
          ? (failures.key === key ? failures.count : 0) + 1
          : 0,
    }));
  }, [
    activeProcessingKey,
    processingFilesErrorAt,
    processingFilesStatus,
    processingFilesUpdatedAt,
  ]);
  const processingStatesUnavailable =
    processingPollFailures.key === activeProcessingKey &&
    processingPollFailures.count >= PROCESSING_FILES_FAILURE_LIMIT;

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
