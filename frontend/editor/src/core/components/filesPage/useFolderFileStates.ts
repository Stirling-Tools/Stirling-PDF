import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiskFileState } from "@app/components/filesPage/FileGrid";
import {
  useProcessingFolders,
  type MountedFileState,
} from "@app/hooks/useProcessingFolders";
import { qk } from "@app/query/keys";

const PROCESSING_FILES_POLL_MS = 3000;
const EMPTY_FILE_STATES: ReadonlyMap<string, DiskFileState> = new Map();
const EMPTY_REVERTABLES: ReadonlySet<string> = new Set();

/** Shares processing states between library views; polling pauses while the tab is hidden. */
export function useFolderFileStates(
  processingRecordId: string | undefined,
  enabled: boolean,
) {
  const { listFiles } = useProcessingFolders();
  const queryClient = useQueryClient();
  const processingFilesKey = qk.processingFolderFiles(processingRecordId ?? "");
  const { data: processingFiles } = useQuery({
    queryKey: processingFilesKey,
    // A failed read clears the ambient badges; the next poll retries.
    queryFn: () => listFiles(processingRecordId!).catch(() => []),
    enabled: enabled && Boolean(processingRecordId),
    refetchInterval: PROCESSING_FILES_POLL_MS,
  });

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

  return { fileStates, revertables, patchProcessingFile };
}
