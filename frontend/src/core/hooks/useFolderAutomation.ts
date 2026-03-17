/**
 * Shared hook for running a file through a Watch Folder's automation pipeline.
 *
 * Extracts the core pipeline that was previously duplicated between
 * SmartFolderHomePage.processFiles and SmartFolderWorkbenchView.runAutomation.
 */

import { useCallback, useRef } from 'react';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { SmartFolder, SmartFolderRunEntry } from '@app/types/smartFolders';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { fileStorage } from '@app/services/fileStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
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

/**
 * Returns a `runPipeline` function that executes a Watch Folder's automation
 * against a single input file, persisting outputs and updating folder metadata.
 *
 * Assumes the file has already been registered in folderStorage by the caller
 * (so the UI shows it immediately). Internally manages a ref-based guard to
 * prevent the same fileId from being processed concurrently.
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
          toolRegistry,
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
        await folderStorage.updateFileMetadata(folder.id, inputFileId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
          failedAttempts: (prev?.failedAttempts ?? 0) + 1,
        });
      } finally {
        processingRef.current.delete(inputFileId);
      }
    },
    [toolRegistry]
  );

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
