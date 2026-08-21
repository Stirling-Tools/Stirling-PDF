/**
 * Shared hook for running a file through a Watched Folder's automation pipeline.
 *
 * Local-only synchronous execution: each file is run through executeAutomationSequence
 * and the outputs are persisted to IndexedDB. Retries are scheduled in
 * folderRetryScheduleStorage and drained on mount / visibility / SW wake.
 *
 * Async server-side jobs and server watched folders are handled in a follow-up PR.
 */

import { useCallback, useEffect, useRef } from "react";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { WatchedFolder } from "@app/types/watchedFolders";
import { automationStorage } from "@app/services/automationStorage";
import { watchedFolderFileStorage } from "@app/services/watchedFolderFileStorage";
import { fileStorage } from "@app/services/fileStorage";
import { folderRunStateStorage } from "@app/services/folderRunStateStorage";
import { folderRetryScheduleStorage } from "@app/services/folderRetryScheduleStorage";
import { watchedFolderStorage } from "@app/services/watchedFolderStorage";
import { executeAutomationSequence } from "@app/utils/automationExecutor";
import { folderDirectoryHandleStorage } from "@app/services/folderDirectoryHandleStorage";
import {
  FileId,
  StirlingFileStub,
  createFileId,
  createStirlingFile,
  createQuickKey,
  isStirlingFile,
} from "@app/types/fileContext";

/**
 * Resolves the storage ID for an input file.
 * - StirlingFiles (already in fileStorage): returns the existing fileId, ownedByFolder=false.
 * - Fresh disk drops: creates a new stub in fileStorage, returns new ID, ownedByFolder=true.
 */
export async function resolveInputFile(
  file: File,
): Promise<{ inputFileId: string; ownedByFolder: boolean }> {
  if (isStirlingFile(file)) {
    return { inputFileId: file.fileId, ownedByFolder: false };
  }
  const newFileId = createFileId();
  const stub: StirlingFileStub = {
    id: newFileId,
    name: file.name,
    type: file.type || "application/pdf",
    size: file.size,
    lastModified: file.lastModified,
    isLeaf: true,
    originalFileId: newFileId,
    versionNumber: 1,
    toolHistory: [],
    quickKey: createQuickKey(file),
    createdAt: Date.now(),
  };
  await fileStorage.storeStirlingFile(
    createStirlingFile(file, newFileId),
    stub,
  );
  return { inputFileId: newFileId, ownedByFolder: true };
}

/** Fire-and-forget: tell the service worker a new retry has been scheduled. */
function notifySW(message: { type: string }): void {
  navigator.serviceWorker?.controller?.postMessage(message);
}

/**
 * Stores pipeline output files, updates folder metadata, and cleans up superseded outputs.
 */
async function finalizeRun(
  folder: WatchedFolder,
  file: File,
  inputFileId: string,
  ownedByFolder: boolean,
  resultFiles: File[],
): Promise<void> {
  const currentFolderData = await watchedFolderFileStorage.getFolderData(
    folder.id,
  );
  const currentMeta = currentFolderData?.files[inputFileId];
  const prevOutputIds: string[] =
    currentMeta?.displayFileIds ??
    (currentMeta?.displayFileId ? [currentMeta.displayFileId] : []);

  const inputStub = await fileStorage.getStirlingFileStub(
    inputFileId as FileId,
  );
  const isVersionMode = folder.outputMode === "new_version";
  const chainRoot = isVersionMode
    ? (inputStub?.originalFileId ?? inputFileId)
    : inputFileId;
  const versionNum = isVersionMode ? (inputStub?.versionNumber ?? 1) + 1 : 2;

  const inputName = inputStub?.name ?? file.name;
  const outputLabel = folder.outputName?.trim() || folder.name;
  const isAutoNumber =
    folder.outputNamePosition === "auto-number" && !isVersionMode;

  // Collect taken names for auto-number deduplication
  const takenNames = new Set<string>();
  if (isAutoNumber) {
    for (const meta of Object.values(currentFolderData?.files ?? {})) {
      const ids =
        meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []);
      for (const oid of ids) {
        const stub = await fileStorage.getStirlingFileStub(oid as FileId);
        if (stub?.name) takenNames.add(stub.name);
      }
    }
  }

  const allOutputIds: string[] = [];

  for (const resultFile of resultFiles) {
    let outputFileName: string;
    if (isVersionMode) {
      outputFileName = inputName;
    } else if (isAutoNumber) {
      const lastDot = inputName.lastIndexOf(".");
      const nameBase = lastDot > 0 ? inputName.slice(0, lastDot) : inputName;
      const ext = lastDot > 0 ? inputName.slice(lastDot) : "";
      if (!takenNames.has(inputName)) {
        outputFileName = inputName;
      } else {
        let n = 1;
        while (takenNames.has(`${nameBase} (${n})${ext}`)) n++;
        outputFileName = `${nameBase} (${n})${ext}`;
      }
      takenNames.add(outputFileName);
    } else {
      outputFileName =
        folder.outputNamePosition === "suffix"
          ? `${inputName}_${outputLabel}`
          : `${outputLabel}_${inputName}`;
    }

    const outputId = createFileId();
    allOutputIds.push(outputId);
    const outputStub: StirlingFileStub = {
      id: outputId,
      name: outputFileName,
      type: resultFile.type || "application/pdf",
      size: resultFile.size,
      lastModified: resultFile.lastModified,
      isLeaf: true,
      originalFileId: chainRoot,
      versionNumber: versionNum,
      parentFileId: inputFileId as FileId,
      toolHistory: [],
      quickKey: createQuickKey(resultFile),
      createdAt: Date.now(),
    };
    const renamedFile =
      outputFileName !== resultFile.name
        ? new File([resultFile], outputFileName, {
            type: resultFile.type,
            lastModified: resultFile.lastModified,
          })
        : resultFile;
    await fileStorage.storeStirlingFile(
      createStirlingFile(renamedFile, outputId),
      outputStub,
    );

    // Write to local FS output directory if configured
    if (folder.hasOutputDirectory) {
      try {
        const dirHandle = await folderDirectoryHandleStorage.get(folder.id);
        if (dirHandle) {
          const hasPermission =
            await folderDirectoryHandleStorage.ensurePermission(dirHandle);
          if (hasPermission) {
            await folderDirectoryHandleStorage.writeFile(
              dirHandle,
              outputFileName,
              renamedFile,
            );
          }
        }
      } catch {
        // Best-effort — FS write failure doesn't block the pipeline
      }
    }
  }

  // Delete stale outputs from a previous run (skip in auto-number mode — outputs accumulate)
  if (!isAutoNumber) {
    for (const oldId of prevOutputIds) {
      try {
        await fileStorage.deleteStirlingFile(oldId as FileId);
      } catch {
        /* ignore */
      }
    }
  }

  // In version mode the input is always superseded; otherwise only hide it when the folder owns it.
  if (isVersionMode || ownedByFolder) {
    await fileStorage.markFileAsProcessed(inputFileId as FileId);
  }

  const processedAt = new Date();
  const accumulatedIds = isAutoNumber
    ? [...prevOutputIds, ...allOutputIds]
    : allOutputIds;
  await watchedFolderFileStorage.updateFileMetadata(folder.id, inputFileId, {
    status: "processed",
    processedAt,
    displayFileId: accumulatedIds[0],
    displayFileIds: accumulatedIds,
  });

  await folderRunStateStorage.appendRunEntries(folder.id, [
    {
      inputFileId,
      displayFileId: accumulatedIds[0],
      displayFileIds: accumulatedIds,
      processedAt,
      status: "processed",
    },
  ]);
}

/**
 * Returns a `runPipeline` function that executes a Watched Folder's automation
 * against a single input file synchronously, persisting outputs and updating
 * folder metadata.
 */
export function useFolderAutomation(toolRegistry: Partial<ToolRegistry>) {
  const processingRef = useRef<Set<string>>(new Set());

  const runPipeline = useCallback(
    async (
      folder: WatchedFolder,
      file: File,
      inputFileId: string,
      ownedByFolder: boolean,
    ): Promise<void> => {
      if (processingRef.current.has(inputFileId)) return;
      processingRef.current.add(inputFileId);

      try {
        const automation = await automationStorage.getAutomation(
          folder.automationId,
        );
        if (!automation) {
          await watchedFolderFileStorage.updateFileMetadata(
            folder.id,
            inputFileId,
            {
              status: "error",
              errorMessage: "Automation not found",
            },
          );
          return;
        }

        await watchedFolderFileStorage.updateFileMetadata(
          folder.id,
          inputFileId,
          {
            status: "processing",
          },
        );

        const resultFiles = await executeAutomationSequence(
          automation,
          [file],
          toolRegistry as ToolRegistry,
        );
        await finalizeRun(
          folder,
          file,
          inputFileId,
          ownedByFolder,
          resultFiles,
        );
      } catch (err: unknown) {
        const existing = await watchedFolderFileStorage.getFolderData(
          folder.id,
        );
        const prev = existing?.files[inputFileId];
        const attempts = (prev?.failedAttempts ?? 0) + 1;
        const maxRetries = folder.maxRetries ?? 3;
        const retryDelayMs = (folder.retryDelayMinutes ?? 5) * 60_000;
        const willRetry =
          maxRetries > 0 && attempts < maxRetries && retryDelayMs > 0;
        const nextRetryAt = willRetry ? Date.now() + retryDelayMs : undefined;

        await watchedFolderFileStorage.updateFileMetadata(
          folder.id,
          inputFileId,
          {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
            failedAttempts: attempts,
            nextRetryAt,
            lastFailedAt: new Date(),
          },
        );

        if (willRetry) {
          await folderRetryScheduleStorage.schedule(
            folder.id,
            inputFileId,
            Date.now() + retryDelayMs,
            attempts,
            prev?.ownedByFolder ?? ownedByFolder,
          );
          notifySW({ type: "SCHEDULE_RETRY" });
        }
      } finally {
        // Safety net: if still 'processing', something went wrong
        try {
          const record = await watchedFolderFileStorage.getFolderData(
            folder.id,
          );
          const fileMeta = record?.files[inputFileId];
          if (fileMeta?.status === "processing") {
            await watchedFolderFileStorage.updateFileMetadata(
              folder.id,
              inputFileId,
              {
                status: "error",
                errorMessage: "Processing failed unexpectedly",
              },
            );
          }
        } catch {
          // Best-effort
        }
        processingRef.current.delete(inputFileId);
      }
    },
    [toolRegistry],
  );

  // Drain due retries on mount, on SW notification, and on visibility restore.
  useEffect(() => {
    async function drainDueRetries() {
      const due = await folderRetryScheduleStorage.claimDue();
      for (const entry of due) {
        const freshFolder = await watchedFolderStorage.getFolder(
          entry.folderId,
        );
        if (!freshFolder || freshFolder.isPaused) continue;
        const freshFile = await fileStorage.getStirlingFile(
          entry.fileId as FileId,
        );
        if (!freshFile) continue;
        await watchedFolderFileStorage.updateFileMetadata(
          entry.folderId,
          entry.fileId,
          {
            status: "pending",
            nextRetryAt: undefined,
          },
        );
        void runPipeline(
          freshFolder,
          freshFile,
          entry.fileId,
          entry.ownedByFolder,
        );
      }
    }

    void drainDueRetries();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-folder-retry.js", { scope: "/" })
        .catch((err) =>
          console.warn("Watched Folder retry SW registration failed:", err),
        );
    }

    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === "PROCESS_DUE_RETRIES") void drainDueRetries();
    }
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void drainDueRetries();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runPipeline]);

  /** Run multiple files through the pipeline concurrently. */
  const processBatch = useCallback(
    (
      folder: WatchedFolder,
      items: Array<{
        file: File;
        inputFileId: string;
        ownedByFolder: boolean;
      }>,
    ) =>
      Promise.all(
        items.map(({ file, inputFileId, ownedByFolder }) =>
          runPipeline(folder, file, inputFileId, ownedByFolder),
        ),
      ),
    [runPipeline],
  );

  return { runPipeline, processBatch };
}
