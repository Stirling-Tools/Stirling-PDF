/**
 * Shared hook for running a file through a Watch Folder's automation pipeline.
 *
 * Extracts the core pipeline that was previously duplicated between
 * SmartFolderHomePage.processFiles and SmartFolderWorkbenchView.runAutomation.
 */

import { useCallback, useEffect, useRef } from 'react';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { SmartFolder, SmartFolderRunEntry } from '@app/types/smartFolders';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { fileStorage } from '@app/services/fileStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { folderRetryScheduleStorage } from '@app/services/folderRetryScheduleStorage';
import { smartFolderStorage } from '@app/services/smartFolderStorage';
import { executeAutomationSequence } from '@app/utils/automationExecutor';
import {
  FileId,
  StirlingFileStub,
  createFileId,
  createStirlingFile,
  createQuickKey,
  isStirlingFile,
} from '@app/types/fileContext';

/**
 * Resolves the storage ID for an input file.
 * - StirlingFiles (already in fileStorage): returns the existing fileId, ownedByFolder=false.
 * - Fresh disk drops: creates a new stub in fileStorage, returns new ID, ownedByFolder=true.
 */
export async function resolveInputFile(
  file: File
): Promise<{ inputFileId: string; ownedByFolder: boolean }> {
  if (isStirlingFile(file)) {
    return { inputFileId: file.fileId, ownedByFolder: false };
  }
  const newFileId = createFileId();
  const stub: StirlingFileStub = {
    id: newFileId,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    lastModified: file.lastModified,
    isLeaf: true,
    originalFileId: newFileId,
    versionNumber: 1,
    toolHistory: [],
    quickKey: createQuickKey(file),
    createdAt: Date.now(),
  };
  await fileStorage.storeStirlingFile(createStirlingFile(file, newFileId), stub);
  return { inputFileId: newFileId, ownedByFolder: true };
}

/** Fire-and-forget: tell the service worker a new retry has been scheduled. */
function notifySW(message: { type: string }): void {
  navigator.serviceWorker?.controller?.postMessage(message);
}

/**
 * Returns a `runPipeline` function that executes a Watch Folder's automation
 * against a single input file, persisting outputs and updating folder metadata.
 *
 * Assumes the file has already been registered in folderStorage by the caller
 * (so the UI shows it immediately). Internally manages a ref-based guard to
 * prevent the same fileId from being processed concurrently.
 *
 * Auto-retry: failed runs are persisted to IndexedDB via folderRetryScheduleStorage.
 * A service worker schedules a timer and notifies the main thread when due; the main
 * thread also drains on mount and visibilitychange so retries are never permanently lost.
 */
export function useFolderAutomation(toolRegistry: Partial<ToolRegistry>) {
  const processingRef = useRef<Set<string>>(new Set());

  const runPipeline = useCallback(
    async (
      folder: SmartFolder,
      file: File,
      inputFileId: string,
      ownedByFolder: boolean
    ): Promise<void> => {
      if (processingRef.current.has(inputFileId)) return;
      processingRef.current.add(inputFileId);

      try {
        const automation = await automationStorage.getAutomation(folder.automationId);
        if (!automation) {
          await folderStorage.updateFileMetadata(folder.id, inputFileId, {
            status: 'error',
            errorMessage: 'Automation not found',
          });
          return;
        }

        // Capture previous output IDs before overwriting metadata, so we can clean them up after
        const prevFolderData = await folderStorage.getFolderData(folder.id);
        const prevMeta = prevFolderData?.files[inputFileId];
        const prevOutputIds: string[] = prevMeta?.displayFileIds
          ?? (prevMeta?.displayFileId ? [prevMeta.displayFileId] : []);

        await folderStorage.updateFileMetadata(folder.id, inputFileId, { status: 'processing' });

        // Step-level callbacks not needed for background folder processing
        const noop = () => {};
        const resultFiles = await executeAutomationSequence(
          automation,
          [file],
          toolRegistry as ToolRegistry,
          noop,
          noop,
          noop
        );

        // Load input stub for version chain info and name fallback
        const inputStub = await fileStorage.getStirlingFileStub(inputFileId as FileId);

        const isVersionMode = folder.outputMode === 'new_version';
        const chainRoot = isVersionMode
          ? (inputStub?.originalFileId ?? inputFileId)
          : inputFileId;
        const versionNum = isVersionMode
          ? (inputStub?.versionNumber ?? 1) + 1
          : 2;

        const allOutputIds: string[] = [];

        const inputName = inputStub?.name ?? file.name;

        const outputLabel = folder.outputName?.trim() || folder.name;

        for (const resultFile of resultFiles) {
          const outputFileName = isVersionMode
            ? inputName
            : folder.outputNamePosition === 'suffix'
              ? `${inputName}_${outputLabel}`
              : `${outputLabel}_${inputName}`;

          const outputId = createFileId();
          allOutputIds.push(outputId);
          const outputStub: StirlingFileStub = {
            id: outputId,
            name: outputFileName,
            type: resultFile.type || 'application/pdf',
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
          const renamedFile = outputFileName !== resultFile.name
            ? new File([resultFile], outputFileName, { type: resultFile.type, lastModified: resultFile.lastModified })
            : resultFile;
          await fileStorage.storeStirlingFile(createStirlingFile(renamedFile, outputId), outputStub);
        }

        // Delete stale output files from a previous run on the same input (re-run case)
        for (const oldId of prevOutputIds) {
          try { await fileStorage.deleteStirlingFile(oldId as FileId); } catch { /* ignore if already gone */ }
        }

        // In version mode the input is always superseded; otherwise only hide it when the folder owns it.
        if (isVersionMode || ownedByFolder) {
          await fileStorage.markFileAsProcessed(inputFileId as FileId);
        }

        const processedAt = new Date();
        await folderStorage.updateFileMetadata(folder.id, inputFileId, {
          status: 'processed',
          processedAt,
          displayFileId: allOutputIds[0],
          displayFileIds: allOutputIds,
        });
        // Atomic append — avoids lost-update race when multiple files are processed concurrently.
        await folderRunStateStorage.appendRunEntries(folder.id, [{
          inputFileId,
          displayFileId: allOutputIds[0],
          displayFileIds: allOutputIds,
          processedAt,
          status: 'processed',
        }]);
      } catch (err: unknown) {
        const existing = await folderStorage.getFolderData(folder.id);
        const prev = existing?.files[inputFileId];
        const attempts = (prev?.failedAttempts ?? 0) + 1;
        const maxRetries = folder.maxRetries ?? 3;
        const retryDelayMs = (folder.retryDelayMinutes ?? 5) * 60_000;
        const willRetry = maxRetries > 0 && attempts < maxRetries && retryDelayMs > 0;
        const nextRetryAt = willRetry ? Date.now() + retryDelayMs : undefined;

        await folderStorage.updateFileMetadata(folder.id, inputFileId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          failedAttempts: attempts,
          nextRetryAt,
        });

        if (willRetry) {
          // Persist the retry schedule in IDB so it survives page close.
          // The service worker picks this up and notifies the main thread when due;
          // the main thread also drains on mount and visibilitychange as a fallback.
          await folderRetryScheduleStorage.schedule(
            folder.id,
            inputFileId,
            Date.now() + retryDelayMs,
            attempts,
            prev?.ownedByFolder ?? ownedByFolder
          );
          notifySW({ type: 'SCHEDULE_RETRY' });
        }
      } finally {
        processingRef.current.delete(inputFileId);
      }
    },
    [toolRegistry]
  );

  // Drain any due retries from the persistent IDB schedule.
  // Called on mount (catches retries missed while the tab was closed), on SW
  // message, and on visibilitychange (fallback when the SW was killed by the browser).
  useEffect(() => {
    async function drainDueRetries() {
      const due = await folderRetryScheduleStorage.claimDue();
      for (const entry of due) {
        const freshFolder = await smartFolderStorage.getFolder(entry.folderId);
        if (!freshFolder || freshFolder.isPaused) continue;
        const freshFile = await fileStorage.getStirlingFile(entry.fileId as FileId);
        if (!freshFile) continue;
        // Reset to pending so the UI reflects "queued again"
        await folderStorage.updateFileMetadata(entry.folderId, entry.fileId, {
          status: 'pending',
          nextRetryAt: undefined,
        });
        void runPipeline(freshFolder, freshFile, entry.fileId, entry.ownedByFolder);
      }
    }

    // Drain missed retries immediately on mount
    void drainDueRetries();

    // Register the service worker (no-op if already registered)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-folder-retry.js', { scope: '/' })
        .catch((err) => console.warn('Watch Folder retry SW registration failed:', err));
    }

    // Listen for SW notifications that a retry is due
    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'PROCESS_DUE_RETRIES') {
        void drainDueRetries();
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    // Drain when the tab becomes visible — covers the case where the SW was terminated
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void drainDueRetries();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runPipeline]);

  /** Run multiple files through the pipeline concurrently. */
  const processBatch = useCallback(
    (folder: SmartFolder, items: Array<{ file: File; inputFileId: string; ownedByFolder: boolean }>) =>
      Promise.all(items.map(({ file, inputFileId, ownedByFolder }) =>
        runPipeline(folder, file, inputFileId, ownedByFolder)
      )),
    [runPipeline]
  );

  return { runPipeline, processBatch };
}
