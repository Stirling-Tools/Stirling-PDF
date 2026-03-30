/**
 * Shared hook for running a file through a Watch Folder's automation pipeline.
 *
 * Files are submitted as async server-side jobs (POST /api/v1/pipeline/jobs). Completion is
 * delivered via SSE (job-complete / job-failed events) so no poll loop is needed while the tab
 * is open. On mount and on visibility change, drainPendingJobs runs once as a recovery check for
 * jobs that completed while the tab was closed or the SSE stream was down.
 *
 * Falls back to synchronous executeBackendPipeline for automations that contain a step
 * requiring client-side processing (custom processor).
 */

import { useCallback, useEffect, useRef } from 'react';
import { addSSEHandler, parsePipelineSSEEvent } from '@app/hooks/useSSEConnection';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { SmartFolder, isServerFolderInput } from '@app/types/smartFolders';
import { automationStorage } from '@app/services/automationStorage';
import { folderStorage } from '@app/services/folderStorage';
import { fileStorage } from '@app/services/fileStorage';
import { folderRunStateStorage } from '@app/services/folderRunStateStorage';
import { folderRetryScheduleStorage } from '@app/services/folderRetryScheduleStorage';
import { smartFolderStorage } from '@app/services/smartFolderStorage';
import {
  executeBackendPipeline,
  submitBackendJob,
  getBackendJobStatus,
  getBackendJobResult,
} from '@app/utils/automationExecutor';
import {
  uploadFileToServerFolder,
  updateServerFolderSession,
  listServerFolderOutput,
  downloadServerFolderOutput,
  deleteServerFolderOutput,
  triggerServerFolderProcessing,
} from '@app/services/serverFolderApiService';
import { folderDirectoryHandleStorage } from '@app/services/folderDirectoryHandleStorage';
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

// ---------------------------------------------------------------------------
// Output finalisation — shared by runPipeline (sync fallback) and drainPendingJobs
// ---------------------------------------------------------------------------

/**
 * Stores pipeline output files, updates folder metadata, and cleans up superseded outputs.
 * Called after the result Files are available, regardless of whether they came from a sync
 * executeBackendPipeline call or an async job poll.
 */
async function finalizeRun(
  folder: SmartFolder,
  file: File,
  inputFileId: string,
  ownedByFolder: boolean,
  resultFiles: File[]
): Promise<void> {
  const currentFolderData = await folderStorage.getFolderData(folder.id);
  const currentMeta = currentFolderData?.files[inputFileId];
  const prevOutputIds: string[] = currentMeta?.displayFileIds
    ?? (currentMeta?.displayFileId ? [currentMeta.displayFileId] : []);

  const inputStub = await fileStorage.getStirlingFileStub(inputFileId as FileId);
  const isVersionMode = folder.outputMode === 'new_version';
  const chainRoot = isVersionMode
    ? (inputStub?.originalFileId ?? inputFileId)
    : inputFileId;
  const versionNum = isVersionMode
    ? (inputStub?.versionNumber ?? 1) + 1
    : 2;

  const inputName = inputStub?.name ?? file.name;
  const outputLabel = folder.outputName?.trim() || folder.name;
  const isAutoNumber = folder.outputNamePosition === 'auto-number' && !isVersionMode;

  // Collect taken names for auto-number deduplication
  const takenNames = new Set<string>();
  if (isAutoNumber) {
    for (const meta of Object.values(currentFolderData?.files ?? {})) {
      const ids = meta.displayFileIds ?? (meta.displayFileId ? [meta.displayFileId] : []);
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
      const lastDot = inputName.lastIndexOf('.');
      const nameBase = lastDot > 0 ? inputName.slice(0, lastDot) : inputName;
      const ext = lastDot > 0 ? inputName.slice(lastDot) : '';
      if (!takenNames.has(inputName)) {
        outputFileName = inputName;
      } else {
        let n = 1;
        while (takenNames.has(`${nameBase} (${n})${ext}`)) n++;
        outputFileName = `${nameBase} (${n})${ext}`;
      }
      takenNames.add(outputFileName);
    } else {
      outputFileName = folder.outputNamePosition === 'suffix'
        ? `${inputName}_${outputLabel}`
        : `${outputLabel}_${inputName}`;
    }

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

    // Write to local FS output directory if configured
    if (folder.hasOutputDirectory) {
      try {
        const dirHandle = await folderDirectoryHandleStorage.get(folder.id);
        if (dirHandle) {
          const hasPermission = await folderDirectoryHandleStorage.ensurePermission(dirHandle);
          if (hasPermission) {
            await folderDirectoryHandleStorage.writeFile(dirHandle, outputFileName, renamedFile);
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
      try { await fileStorage.deleteStirlingFile(oldId as FileId); } catch { /* ignore */ }
    }
  }

  // In version mode the input is always superseded; otherwise only hide it when the folder owns it.
  if (isVersionMode || ownedByFolder) {
    await fileStorage.markFileAsProcessed(inputFileId as FileId);
  }

  const processedAt = new Date();
  const accumulatedIds = isAutoNumber ? [...prevOutputIds, ...allOutputIds] : allOutputIds;
  await folderStorage.updateFileMetadata(folder.id, inputFileId, {
    status: 'processed',
    processedAt,
    displayFileId: accumulatedIds[0],
    displayFileIds: accumulatedIds,
  });

  await folderRunStateStorage.appendRunEntries(folder.id, [{
    inputFileId,
    displayFileId: accumulatedIds[0],
    displayFileIds: accumulatedIds,
    processedAt,
    status: 'processed',
  }]);
}

// ---------------------------------------------------------------------------
// Helper — find a folder+file record by serverJobId (used by SSE handler)
// ---------------------------------------------------------------------------

async function findFileByJobId(
  jobId: string
): Promise<{ folder: SmartFolder; fileId: string; meta: import('@app/types/smartFolders').FolderFileMetadata } | null> {
  const folders = await smartFolderStorage.getAllFolders();
  for (const folder of folders) {
    const folderData = await folderStorage.getFolderData(folder.id);
    if (!folderData) continue;
    for (const [fileId, meta] of Object.entries(folderData.files)) {
      if (meta.serverJobId === jobId) return { folder, fileId, meta };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns a `runPipeline` function that executes a Watch Folder's automation
 * against a single input file, persisting outputs and updating folder metadata.
 *
 * Async server-side jobs: for automations that can run fully on the backend, the file is
 * submitted via POST /api/v1/pipeline/jobs. Completion is delivered via SSE (job-complete /
 * job-failed events) — no poll loop runs while the tab is open. drainPendingJobs runs once
 * on mount/visibility as a recovery path for jobs that completed while the tab was closed.
 *
 * Sync fallback: automations that contain a client-side-only step run synchronously via
 * executeBackendPipeline (tab-close resilience does not apply to these).
 */
export function useFolderAutomation(toolRegistry: Partial<ToolRegistry>) {
  const processingRef = useRef<Set<string>>(new Set());

  // ── Finalise a job from the SSE handler ───────────────────────────────────
  const finalizeFromSSE = useCallback(async (jobId: string, error?: string) => {
    const match = await findFileByJobId(jobId);
    if (!match) return;
    const { folder, fileId, meta } = match;

    if (processingRef.current.has(fileId)) return; // drain already handling it
    processingRef.current.add(fileId);
    try {
      const freshMeta = (await folderStorage.getFolderData(folder.id))?.files[fileId];
      if (freshMeta?.status !== 'processing') return; // already finalised by drain

      if (error) {
        await folderStorage.updateFileMetadata(folder.id, fileId, {
          status: 'error',
          errorMessage: error,
          serverJobId: undefined,
        });
        return;
      }

      const inputFile = await fileStorage.getStirlingFile(fileId as FileId);
      if (!inputFile) {
        await folderStorage.updateFileMetadata(folder.id, fileId, {
          status: 'error',
          errorMessage: 'Input file missing from storage',
          serverJobId: undefined,
        });
        return;
      }
      const resultFiles = await getBackendJobResult(jobId, folder.name);
      await finalizeRun(folder, inputFile, fileId, meta.ownedByFolder ?? false, resultFiles);
      await folderStorage.updateFileMetadata(folder.id, fileId, { serverJobId: undefined });
    } catch (err) {
      await folderStorage.updateFileMetadata(folder.id, fileId, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Failed to retrieve job result',
        serverJobId: undefined,
      });
    } finally {
      processingRef.current.delete(fileId);
    }
  }, []);

  // ── Server-folder SSE completion handler ──────────────────────────────────
  // Output filenames are "{fileId}.{ext}" — strip extension to get the IDB fileId directly.
  // Outputs stay on the server; we only update IDB metadata. If a local output directory is
  // configured we download → write to FS → optionally delete from server.
  const finalizeFromServerFolderSSE = useCallback(async (
    folderId: string,
    outputFilenames: string[]
  ) => {
    const folder = await smartFolderStorage.getFolder(folderId);
    if (!folder || folder.isPaused) return;
    const folderData = await folderStorage.getFolderData(folderId);
    if (!folderData) return;

    for (const outputFilename of outputFilenames) {
      // Recover fileId from "{fileId}.{ext}"
      const dotIdx = outputFilename.lastIndexOf('.');
      const fileId = dotIdx > 0 ? outputFilename.slice(0, dotIdx) : outputFilename;

      const meta = folderData.files[fileId];
      if (!meta || meta.status !== 'processing' || !meta.pendingOnServerFolder) continue;
      if (processingRef.current.has(fileId)) continue;
      processingRef.current.add(fileId);
      try {
        const freshMeta = (await folderStorage.getFolderData(folderId))?.files[fileId];
        if (freshMeta?.status !== 'processing') continue; // already finalised

        const processedAt = new Date();

        // Record completion — output lives on the server, not in IDB file storage
        await folderStorage.updateFileMetadata(folderId, fileId, {
          status: 'processed',
          processedAt,
          serverOutputFilenames: [outputFilename],
          pendingOnServerFolder: undefined,
        });
        await folderRunStateStorage.appendRunEntries(folderId, [{
          inputFileId: fileId,
          displayFileId: fileId,
          processedAt,
          status: 'processed',
        }]);

        // Export to local FS output directory if one is configured
        if (folder.hasOutputDirectory) {
          try {
            const resultFile = await downloadServerFolderOutput(folderId, outputFilename);
            if (folder.deleteOutputOnDownload) {
              deleteServerFolderOutput(folderId, outputFilename).catch(() => {});
            }
            const dirHandle = await folderDirectoryHandleStorage.get(folder.id);
            if (dirHandle) {
              const hasPermission = await folderDirectoryHandleStorage.ensurePermission(dirHandle);
              if (hasPermission) {
                await folderDirectoryHandleStorage.writeFile(dirHandle, outputFilename, resultFile);
              }
            }
          } catch {
            // Best-effort — FS export failure doesn't mark the run as failed
          }
        }
      } catch (err) {
        await folderStorage.updateFileMetadata(folderId, fileId, {
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Failed to finalize server output',
          pendingOnServerFolder: undefined,
        });
      } finally {
        processingRef.current.delete(fileId);
      }
    }
  }, []);

  // ── Server-folder SSE error handler ───────────────────────────────────────
  // Marks files as failed when PipelineDirectoryProcessor reports a batch error.
  const finalizeServerFolderError = useCallback(async (
    folderId: string,
    failedFileIds: string[]
  ) => {
    for (const fileId of failedFileIds) {
      if (processingRef.current.has(fileId)) continue;
      processingRef.current.add(fileId);
      try {
        await folderStorage.updateFileMetadata(folderId, fileId, {
          status: 'error',
          errorMessage: 'Server-side processing failed',
          pendingOnServerFolder: undefined,
        });
      } catch { /* ignore */ } finally {
        processingRef.current.delete(fileId);
      }
    }
  }, []);

  // ── Recovery drain — runs once on mount/visibility/SW wake ────────────────
  // Only needed when SSE was down during job completion (tab close, server restart).
  // On transient network errors: leave as 'processing' — drain retries next cycle.
  // On 404: job expired from server — mark as error.
  const drainPendingJobs = useCallback(async () => {
    const folders = await smartFolderStorage.getAllFolders();
    for (const folder of folders) {
      if (folder.isPaused) continue;
      const folderData = await folderStorage.getFolderData(folder.id);
      if (!folderData) continue;

      for (const [fileId, meta] of Object.entries(folderData.files)) {
        if (meta.status !== 'processing' || !meta.serverJobId) continue;
        if (processingRef.current.has(fileId)) continue;

        const jobId = meta.serverJobId;
        processingRef.current.add(fileId);
        try {
          let jobStatus: Awaited<ReturnType<typeof getBackendJobStatus>>;
          try {
            jobStatus = await getBackendJobStatus(jobId);
          } catch (err: unknown) {
            // 404 → job expired (server restarted / TTL hit) — surface as error
            // Anything else → transient network issue, leave as 'processing' for next drain
            if ((err as any)?.response?.status === 404) {
              await folderStorage.updateFileMetadata(folder.id, fileId, {
                status: 'error',
                errorMessage: 'Job expired — server may have restarted. Retry to reprocess.',
                serverJobId: undefined,
              });
            }
            continue;
          }

          if (jobStatus.status === 'completed') {
            const inputFile = await fileStorage.getStirlingFile(fileId as FileId);
            if (!inputFile) {
              await folderStorage.updateFileMetadata(folder.id, fileId, {
                status: 'error',
                errorMessage: 'Input file missing from storage',
                serverJobId: undefined,
              });
              continue;
            }
            try {
              const resultFiles = await getBackendJobResult(jobId, folder.name);
              await finalizeRun(folder, inputFile, fileId, meta.ownedByFolder ?? false, resultFiles);
              await folderStorage.updateFileMetadata(folder.id, fileId, { serverJobId: undefined });
            } catch (err) {
              await folderStorage.updateFileMetadata(folder.id, fileId, {
                status: 'error',
                errorMessage: err instanceof Error ? err.message : 'Failed to retrieve job result',
                serverJobId: undefined,
              });
            }
          } else if (jobStatus.status === 'failed') {
            await folderStorage.updateFileMetadata(folder.id, fileId, {
              status: 'error',
              errorMessage: jobStatus.error || 'Server job failed',
              serverJobId: undefined,
            });
          }
          // 'pending' | 'processing' → SSE will deliver completion; drain is done here
        } finally {
          processingRef.current.delete(fileId);
        }
      }

      // Recovery for server-folder files: SSE may have been down when the scan cycle completed.
      // List the server's processed/ dir and finalize any outputs whose stem matches a pending fileId.
      const pendingServerFileIds = Object.entries(folderData.files)
        .filter(([, m]) => m.status === 'processing' && m.pendingOnServerFolder)
        .map(([id]) => id);

      if (pendingServerFileIds.length === 0 || !isServerFolderInput(folder)) continue;

      let outputs: import('@app/services/serverFolderApiService').ServerFolderOutputFile[];
      try {
        outputs = await listServerFolderOutput(folder.id);
      } catch {
        continue; // server unavailable — leave as processing for next drain
      }

      for (const outputFile of outputs) {
        const dotIdx = outputFile.filename.lastIndexOf('.');
        const fileId = dotIdx > 0 ? outputFile.filename.slice(0, dotIdx) : outputFile.filename;
        if (!pendingServerFileIds.includes(fileId)) continue;
        if (processingRef.current.has(fileId)) continue;
        processingRef.current.add(fileId);
        try {
          const freshMeta = (await folderStorage.getFolderData(folder.id))?.files[fileId];
          if (freshMeta?.status !== 'processing') continue;

          const inputFile = await fileStorage.getStirlingFile(fileId as FileId);
          if (!inputFile) {
            await folderStorage.updateFileMetadata(folder.id, fileId, {
              status: 'error',
              errorMessage: 'Input file missing from storage',
              pendingOnServerFolder: undefined,
            });
            continue;
          }
          const processedAt = new Date();
          await folderStorage.updateFileMetadata(folder.id, fileId, {
            status: 'processed',
            processedAt,
            serverOutputFilenames: [outputFile.filename],
            pendingOnServerFolder: undefined,
          });
          await folderRunStateStorage.appendRunEntries(folder.id, [{
            inputFileId: fileId,
            displayFileId: fileId,
            processedAt,
            status: 'processed',
          }]);

          if (folder.hasOutputDirectory) {
            try {
              const resultFile = await downloadServerFolderOutput(folder.id, outputFile.filename);
              if (folder.deleteOutputOnDownload) {
                deleteServerFolderOutput(folder.id, outputFile.filename).catch(() => {});
              }
              const dirHandle = await folderDirectoryHandleStorage.get(folder.id);
              if (dirHandle) {
                const hasPermission = await folderDirectoryHandleStorage.ensurePermission(dirHandle);
                if (hasPermission) {
                  await folderDirectoryHandleStorage.writeFile(dirHandle, outputFile.filename, resultFile);
                }
              }
            } catch { /* best-effort */ }
          }
        } catch (err) {
          await folderStorage.updateFileMetadata(folder.id, fileId, {
            status: 'error',
            errorMessage: err instanceof Error ? err.message : 'Failed to retrieve server output',
            pendingOnServerFolder: undefined,
          });
        } finally {
          processingRef.current.delete(fileId);
        }
      }
    }
  }, []);

  // ── Core pipeline runner ───────────────────────────────────────────────────
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

        await folderStorage.updateFileMetadata(folder.id, inputFileId, { status: 'processing' });

        // Server-folder input — upload to watch folder, trigger immediate processing via SSE
        if (isServerFolderInput(folder)) {
          await uploadFileToServerFolder(folder.id, inputFileId, file);
          await folderStorage.updateFileMetadata(folder.id, inputFileId, {
            pendingOnServerFolder: true,
          });
          // Fire-and-forget trigger — don't wait for processing to start
          triggerServerFolderProcessing(folder.id).catch(() => {});
          processingRef.current.delete(inputFileId);
          return;
        }

        // Try async server job first — completion arrives via SSE, no poll loop needed
        const jobId = await submitBackendJob(automation, [file], toolRegistry);

        if (jobId !== null) {
          await folderStorage.updateFileMetadata(folder.id, inputFileId, { serverJobId: jobId });
          // Release lock — SSE handler / drain will re-acquire when finalising
          processingRef.current.delete(inputFileId);
          return;
        }

        // Sync fallback (automation contains a custom-processor step)
        const resultFiles = await executeBackendPipeline(automation, [file], toolRegistry);
        await finalizeRun(folder, file, inputFileId, ownedByFolder, resultFiles);

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
          lastFailedAt: new Date(),
        });

        if (willRetry) {
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
        // Safety net: if still 'processing' without a serverJobId, something went wrong
        try {
          const record = await folderStorage.getFolderData(folder.id);
          const fileMeta = record?.files[inputFileId];
          if (fileMeta?.status === 'processing' && !fileMeta?.serverJobId && !fileMeta?.pendingOnServerFolder) {
            await folderStorage.updateFileMetadata(folder.id, inputFileId, {
              status: 'error',
              errorMessage: 'Processing failed unexpectedly',
            });
          }
        } catch {
          // Best-effort
        }
        processingRef.current.delete(inputFileId);
      }
    },
    [toolRegistry]
  );

  // ── Sync server-folder sessions on mount ──────────────────────────────────
  // Ensures the server's session.json always points to the current browser session,
  // so SSE notifications are routed here even after localStorage was cleared.
  const syncServerFolderSessions = useCallback(async () => {
    const folders = await smartFolderStorage.getAllFolders();
    for (const folder of folders) {
      if (!isServerFolderInput(folder)) continue;
      try {
        await updateServerFolderSession(folder.id);
      } catch {
        // Best-effort — server folder may not exist yet or server may be down
      }
    }
  }, []);

  // ── Lifecycle effects ──────────────────────────────────────────────────────
  useEffect(() => {
    async function drainDueRetries() {
      const due = await folderRetryScheduleStorage.claimDue();
      for (const entry of due) {
        const freshFolder = await smartFolderStorage.getFolder(entry.folderId);
        if (!freshFolder || freshFolder.isPaused) continue;
        const freshFile = await fileStorage.getStirlingFile(entry.fileId as FileId);
        if (!freshFile) continue;
        await folderStorage.updateFileMetadata(entry.folderId, entry.fileId, {
          status: 'pending',
          nextRetryAt: undefined,
          serverJobId: undefined,
        });
        void runPipeline(freshFolder, freshFile, entry.fileId, entry.ownedByFolder);
      }
    }

    void drainDueRetries();
    void drainPendingJobs();
    void syncServerFolderSessions();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-folder-retry.js', { scope: '/' })
        .catch((err) => console.warn('Watch Folder retry SW registration failed:', err));
    }

    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'PROCESS_DUE_RETRIES') void drainDueRetries();
      if (event.data?.type === 'POLL_PIPELINE_JOBS') void drainPendingJobs();
    }
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void drainDueRetries();
        void drainPendingJobs();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // SSE handler — receives job-complete / job-failed / server-folder-complete / server-folder-error events
    const removeSSEHandler = addSSEHandler((data: unknown) => {
      const event = parsePipelineSSEEvent(data);
      if (!event) return;
      if (event.type === 'job-complete') void finalizeFromSSE(event.jobId);
      if (event.type === 'job-failed') void finalizeFromSSE(event.jobId, event.error ?? 'Server job failed');
      if (event.type === 'server-folder-complete') void finalizeFromServerFolderSSE(event.folderId, event.outputFiles);
      if (event.type === 'server-folder-error') void finalizeServerFolderError(event.folderId, event.failedFileIds);
    });

    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      removeSSEHandler();
    };
  }, [runPipeline, drainPendingJobs, finalizeFromSSE, finalizeFromServerFolderSSE, finalizeServerFolderError, syncServerFolderSessions]);

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
