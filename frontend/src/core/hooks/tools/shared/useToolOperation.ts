import { useCallback, useRef, useEffect, useContext } from "react";
import apiClient from "@app/services/apiClient";
import { useTranslation } from "react-i18next";
import { useFileContext } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { ViewerContext } from "@app/contexts/ViewerContext";
import { useToolState } from "@app/hooks/tools/shared/useToolState";
import {
  useToolApiCalls,
  type ApiCallsConfig,
} from "@app/hooks/tools/shared/useToolApiCalls";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";
import {
  extractErrorMessage,
  handle422Error,
} from "@app/utils/toolErrorHandler";
import {
  StirlingFile,
  extractFiles,
  FileId,
  StirlingFileStub,
} from "@app/types/fileContext";
import { FILE_EVENTS } from "@app/services/errorUtils";
import { getFilenameWithoutExtension } from "@app/utils/fileUtils";
import {
  createChildStub,
  generateProcessedFileMetadata,
} from "@app/contexts/file/fileActions";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import { ToolOperation } from "@app/types/file";
import { ensureBackendReady } from "@app/services/backendReadinessGuard";
import { useWillUseCloud } from "@app/hooks/useWillUseCloud";
import { useCreditCheck } from "@app/hooks/useCreditCheck";
import { notifyPdfProcessingComplete } from "@app/services/desktopNotificationService";
import {
  buildInputTracking,
  buildOutputPairs,
} from "@app/hooks/tools/shared/toolOperationHelpers";
import {
  ToolType,
  ToolOperationConfig,
  ToolOperationHook,
  CustomProcessorResult,
  SingleFileToolOperationConfig,
  MultiFileToolOperationConfig,
  CustomToolOperationConfig,
  ProcessingProgress,
  ResponseHandler,
} from "@app/hooks/tools/shared/toolOperationTypes";

export { ToolType };
export type {
  ToolOperationConfig,
  ToolOperationHook,
  CustomProcessorResult,
  SingleFileToolOperationConfig,
  MultiFileToolOperationConfig,
  CustomToolOperationConfig,
  ProcessingProgress,
  ResponseHandler,
};

// Re-export for backwards compatibility
export { createStandardErrorHandler } from "@app/utils/toolErrorHandler";

/**
 * Shared hook for tool operations providing consistent error handling, progress tracking,
 * and FileContext integration. Eliminates boilerplate while maintaining flexibility.
 *
 * Supports three tool patterns:
 * 1. Single-file tools: Set multiFileEndpoint: false, processes files individually
 * 2. Multi-file tools: Set multiFileEndpoint: true, single API call with all files
 * 3. Complex tools: Provide customProcessor for full control over processing logic
 *
 * @param config - Tool operation configuration
 * @returns Hook interface with state and execution methods
 */
export const useToolOperation = <TParams>(
  config: ToolOperationConfig<TParams>,
): ToolOperationHook<TParams> => {
  const { t } = useTranslation();
  const { addFiles, consumeFiles, undoConsumeFiles, selectors } =
    useFileContext();
  const { actions: navActions } = useNavigationActions();
  const viewerContext = useContext(ViewerContext);
  const setActiveFileId = viewerContext?.setActiveFileId ?? (() => {});

  // Composed hooks
  const { state, actions } = useToolState();
  const { actions: fileActions } = useFileContext();
  const { processFiles, cancelOperation: cancelApiCalls } =
    useToolApiCalls<TParams>();
  const {
    generateThumbnails,
    createDownloadInfo,
    cleanupBlobUrls,
    extractZipFiles,
  } = useToolResources();

  // Determine endpoint for cloud usage check and credit routing.
  // For function endpoints, use defaultParameters to get a representative static value.
  const endpointString = config.endpoint
    ? typeof config.endpoint === "function"
      ? config.defaultParameters
        ? (config.endpoint(config.defaultParameters) ?? undefined)
        : undefined
      : config.endpoint
    : undefined;

  const { checkCredits } = useCreditCheck(config.operationType, endpointString);
  const willUseCloud = useWillUseCloud(endpointString);

  // Track last operation for undo functionality
  const lastOperationRef = useRef<{
    inputFiles: File[];
    inputStirlingFileStubs: StirlingFileStub[];
    outputFileIds: FileId[];
  } | null>(null);

  const executeOperation = useCallback(
    async (params: TParams, selectedFiles: StirlingFile[]): Promise<void> => {
      // Validation
      if (selectedFiles.length === 0) {
        actions.setError(t("noFileSelected", "No files selected"));
        return;
      }

      // Handle zero-byte inputs explicitly: mark as error and continue with others
      const zeroByteFiles = selectedFiles.filter((file) => file.size === 0);
      if (zeroByteFiles.length > 0) {
        try {
          for (const f of zeroByteFiles) {
            fileActions.markFileError(f.fileId);
          }
        } catch (e) {
          console.log("markFileError", e);
        }
      }
      const validFiles: StirlingFile[] = selectedFiles.filter(
        (file) => file.size > 0,
      );
      if (validFiles.length === 0) {
        actions.setError(t("noValidFiles", "No valid files to process"));
        return;
      }

      // Block encrypted files from being sent to backend tools
      const encryptedFiles = validFiles.filter((f) => {
        const stub = selectors.getStirlingFileStub(f.fileId);
        return stub?.processedFile?.isEncrypted === true;
      });
      if (encryptedFiles.length > 0) {
        for (const ef of encryptedFiles) {
          fileActions.openEncryptedUnlockPrompt(ef.fileId);
        }
        actions.setError(
          encryptedFiles.length === 1
            ? t(
                "encryptedFileBlocked",
                "File is password-protected. Unlock it first.",
              )
            : t(
                "encryptedFilesBlocked",
                "{{count}} files are password-protected. Unlock them first.",
                {
                  count: encryptedFiles.length,
                },
              ),
        );
        return;
      }

      // Resolve the runtime endpoint from params (static string or function result).
      // Custom processors may omit endpoint entirely — result is undefined in that case.
      const runtimeEndpoint: string | undefined = config.endpoint
        ? typeof config.endpoint === "function"
          ? (config.endpoint(params) ?? undefined)
          : config.endpoint
        : undefined;

      // Credit check — no-op in core builds, real check in desktop/SaaS versions.
      // Pass runtime endpoint so the check can determine if this routes locally (no credits needed).
      const creditError = await checkCredits(runtimeEndpoint);
      if (creditError !== null) {
        actions.setError(creditError);
        return;
      }

      // Backend readiness check (will skip for SaaS-routed endpoints).
      // Custom processors without an endpoint skip this — they manage their own backend calls.
      const endpointForReadyCheck =
        config.toolType !== ToolType.custom ? runtimeEndpoint : undefined;
      const backendReady = await ensureBackendReady(endpointForReadyCheck);
      if (!backendReady) {
        actions.setError(
          t(
            "backendHealth.offline",
            "Embedded backend is offline. Please try again shortly.",
          ),
        );
        return;
      }

      // Reset state
      actions.setLoading(true);
      actions.setError(null);
      actions.resetResults();
      cleanupBlobUrls();

      // Prepare files with history metadata injection (for PDFs)
      actions.setStatus("Processing files...");

      // Listen for global error file id events from HTTP interceptor during this run
      let externalErrorFileIds: string[] = [];
      const errorListener = (e: Event) => {
        const detail = (e as CustomEvent)?.detail as any;
        if (detail?.fileIds) {
          externalErrorFileIds = Array.isArray(detail.fileIds)
            ? detail.fileIds
            : [];
        }
      };
      window.addEventListener(
        FILE_EVENTS.markError,
        errorListener as EventListener,
      );

      try {
        let processedFiles: File[];
        let successSourceIds: FileId[] = [];

        // Use original files directly (no PDF metadata injection - history stored in IndexedDB)
        const filesForAPI = extractFiles(validFiles);

        switch (config.toolType) {
          case ToolType.singleFile: {
            // Individual file processing - separate API call per file
            const apiCallsConfig: ApiCallsConfig<TParams> = {
              endpoint: config.endpoint,
              buildFormData: config.buildFormData,
              filePrefix: config.filePrefix,
              responseHandler: config.responseHandler,
              preserveBackendFilename: config.preserveBackendFilename,
            };
            console.debug("[useToolOperation] Multi-file start", {
              count: filesForAPI.length,
            });
            const result = await processFiles(
              params,
              validFiles,
              apiCallsConfig,
              actions.setProgress,
              actions.setStatus,
              fileActions.markFileError,
            );
            processedFiles = result.outputFiles;
            successSourceIds = result.successSourceIds;
            console.debug("[useToolOperation] Multi-file results", {
              outputFiles: processedFiles.length,
              successSources: result.successSourceIds.length,
            });
            break;
          }
          case ToolType.multiFile: {
            // Multi-file processing - single API call with all files
            actions.setStatus("Processing files...");
            const formData = config.buildFormData(params, filesForAPI);
            const endpoint =
              typeof config.endpoint === "function"
                ? config.endpoint(params)
                : config.endpoint;

            const response = await apiClient.post(endpoint, formData, {
              responseType: "blob",
            });

            // Multi-file responses are typically ZIP files that need extraction, but some may return single PDFs
            if (config.responseHandler) {
              // Use custom responseHandler for multi-file (handles ZIP extraction)
              processedFiles = await config.responseHandler(
                response.data,
                filesForAPI,
              );
            } else if (
              response.data.type === "application/pdf" ||
              (response.headers &&
                response.headers["content-type"] === "application/pdf")
            ) {
              // Single PDF response (e.g. split with merge option) - add prefix to first original filename
              const filename = `${config.filePrefix}${filesForAPI[0]?.name || "document.pdf"}`;
              const singleFile = new File([response.data], filename, {
                type: "application/pdf",
              });
              processedFiles = [singleFile];
            } else {
              // Default: assume ZIP response for multi-file endpoints
              // Note: extractZipFiles will check preferences.autoUnzip setting
              processedFiles = await extractZipFiles(response.data);
            }
            // Assume all inputs succeeded together unless server provided an error earlier
            successSourceIds = validFiles.map((f) => f.fileId);
            break;
          }

          case ToolType.custom: {
            actions.setStatus("Processing files...");
            const result = await config.customProcessor(params, filesForAPI);

            processedFiles = result.files;
            const consumedAllInputs = result.consumedAllInputs || false;

            // If consumedAllInputs flag is set, mark all inputs as successful
            // (used for operations that combine N inputs into fewer outputs)
            if (consumedAllInputs) {
              successSourceIds = validFiles.map((f) => f.fileId);
            } else {
              // Try to map outputs back to inputs by filename (before extension)
              const inputBaseNames = new Map<string, FileId>();
              for (const f of validFiles) {
                const base = getFilenameWithoutExtension(f.name || "");
                inputBaseNames.set(base, f.fileId);
              }
              const mappedSuccess: FileId[] = [];
              for (const out of processedFiles) {
                const base = getFilenameWithoutExtension(out.name || "");
                const id = inputBaseNames.get(base);
                if (id) mappedSuccess.push(id);
              }
              // Fallback to naive alignment if names don't match
              if (mappedSuccess.length === 0) {
                successSourceIds = validFiles
                  .slice(0, processedFiles.length)
                  .map((f) => f.fileId);
              } else {
                successSourceIds = mappedSuccess;
              }
            }
            break;
          }
        }

        // Normalize error flags across tool types: mark failures, clear successes
        try {
          const allInputIds = validFiles.map((f) => f.fileId);
          const okSet = new Set(successSourceIds);
          // Clear errors on successes
          for (const okId of okSet) {
            try {
              fileActions.clearFileError(okId);
            } catch (_e) {
              void _e;
            }
          }
          // Mark errors on inputs that didn't succeed
          for (const id of allInputIds) {
            if (!okSet.has(id)) {
              try {
                fileActions.markFileError(id);
              } catch (_e) {
                void _e;
              }
            }
          }
        } catch (_e) {
          void _e;
        }

        if (externalErrorFileIds.length > 0) {
          // If backend told us which sources failed, prefer that mapping
          successSourceIds = validFiles
            .map((f) => f.fileId)
            .filter((id) => !externalErrorFileIds.includes(id));
          // Also mark failed IDs immediately
          try {
            for (const badId of externalErrorFileIds) {
              fileActions.markFileError(badId as FileId);
            }
          } catch (_e) {
            void _e;
          }
        }

        if (processedFiles.length > 0) {
          actions.setFiles(processedFiles);

          // Generate thumbnails and download URL concurrently
          actions.setGeneratingThumbnails(true);
          const [thumbnails, downloadInfo] = await Promise.all([
            generateThumbnails(processedFiles),
            createDownloadInfo(processedFiles, config.operationType),
          ]);
          actions.setGeneratingThumbnails(false);

          actions.setThumbnails(thumbnails);

          // Determine whether outputs are new versions of their inputs or independent artifacts.
          // A version operation produces exactly one output per successful input, all in the same
          // format (e.g. compress, rotate, redact: 1→1 or N→N same extension).
          // Everything else — format conversions (ext change), merges (N→1), splits (1→N) —
          // produces outputs that have no meaningful parent-child relationship with the inputs.
          const isVersionOp =
            processedFiles.length > 0 &&
            successSourceIds.length === processedFiles.length &&
            successSourceIds.every((id, i) => {
              const inputFile = validFiles.find((f) => f.fileId === id);
              const inExt = inputFile?.name.split(".").pop()?.toLowerCase();
              const outExt = processedFiles[i].name
                .split(".")
                .pop()
                ?.toLowerCase();
              return inExt != null && inExt === outExt;
            });

          actions.setStatus("Generating metadata for processed files...");
          const processedFileMetadataArray = await Promise.all(
            processedFiles.map((file) => generateProcessedFileMetadata(file)),
          );

          const { inputFileIds, inputStirlingFileStubs } = buildInputTracking(
            validFiles,
            selectors,
          );

          if (isVersionOp) {
            // Output is a modified version of the input — link it to the input's version chain.
            // The input is removed from the workbench and replaced in-place by the output.
            const downloadLocalPath =
              selectors.getStirlingFileStub(validFiles[0].fileId)
                ?.localFilePath ?? null;

            const newToolOperation: ToolOperation = {
              toolId: config.operationType,
              timestamp: Date.now(),
            };

            const successInputStubs = successSourceIds
              .map((id) => selectors.getStirlingFileStub(id))
              .filter(Boolean) as StirlingFileStub[];

            if (successInputStubs.length !== processedFiles.length) {
              console.warn(
                "[useToolOperation] Mismatch successInputStubs vs outputs",
                {
                  successInputStubs: successInputStubs.length,
                  outputs: processedFiles.length,
                },
              );
            }

            const { outputStirlingFileStubs, outputStirlingFiles } =
              buildOutputPairs(
                processedFiles,
                thumbnails,
                processedFileMetadataArray,
                (file, thumbnail, metadata, index) =>
                  createChildStub(
                    successInputStubs[index] ||
                      inputStirlingFileStubs[index] ||
                      inputStirlingFileStubs[0],
                    newToolOperation,
                    file,
                    thumbnail,
                    metadata,
                  ),
              );

            // Only consume inputs that successfully produced outputs
            const toConsumeInputIds = successSourceIds.filter((id) =>
              inputFileIds.includes(id),
            );
            console.debug("[useToolOperation] Consuming files (version)", {
              inputCount: inputFileIds.length,
              toConsume: toConsumeInputIds.length,
            });
            const outputFileIds = await consumeFiles(
              toConsumeInputIds,
              outputStirlingFiles,
              outputStirlingFileStubs,
            );
            // Tell the viewer to follow the replacement file — consumeFiles prepends the new file
            // to the list, so activeFileIndex would point to the wrong file without this.
            if (outputFileIds.length === 1) setActiveFileId(outputFileIds[0]);

            // Notify on desktop when processing completes
            await notifyPdfProcessingComplete(outputFileIds.length);

            // Carry the desktop save path forward so the output can be saved back to the same file
            if (toConsumeInputIds.length === 1 && outputFileIds.length === 1) {
              const inputStub = selectors.getStirlingFileStub(
                toConsumeInputIds[0],
              );
              if (inputStub?.localFilePath) {
                fileActions.updateStirlingFileStub(outputFileIds[0], {
                  localFilePath: inputStub.localFilePath,
                });
              }
            }

            actions.setDownloadInfo(
              downloadInfo.url,
              downloadInfo.filename,
              downloadLocalPath,
              outputFileIds,
            );

            lastOperationRef.current = {
              inputFiles: extractFiles(validFiles),
              inputStirlingFileStubs: inputStirlingFileStubs.map((record) => ({
                ...record,
              })),
              outputFileIds,
            };
          } else {
            // Outputs are independent artifacts (format conversion, merge, split).
            // Create fresh root stubs with no parent chain, then swap out only the inputs
            // that successfully produced outputs — other workbench files are untouched.
            const { outputStirlingFileStubs, outputStirlingFiles } =
              buildOutputPairs(
                processedFiles,
                thumbnails,
                processedFileMetadataArray,
                (file, thumbnail, metadata) =>
                  createNewStirlingFileStub(
                    file,
                    undefined,
                    thumbnail,
                    metadata,
                  ),
              );

            const toConsumeInputIds = successSourceIds.filter((id) =>
              inputFileIds.includes(id),
            );
            console.debug("[useToolOperation] Consuming files (independent)", {
              inputCount: inputFileIds.length,
              toConsume: toConsumeInputIds.length,
            });
            const outputFileIds = await consumeFiles(
              toConsumeInputIds,
              outputStirlingFiles,
              outputStirlingFileStubs,
            );

            // Notify on desktop when processing completes
            await notifyPdfProcessingComplete(outputFileIds.length);

            actions.setDownloadInfo(
              downloadInfo.url,
              downloadInfo.filename,
              null,
              outputFileIds,
            );

            // Send the user to the viewer for a single PDF output, otherwise the file editor
            const isSinglePdf =
              processedFiles.length === 1 &&
              processedFiles[0].type === "application/pdf";
            navActions.setWorkbench(isSinglePdf ? "viewer" : "fileEditor");

            lastOperationRef.current = {
              inputFiles: extractFiles(validFiles),
              inputStirlingFileStubs: inputStirlingFileStubs.map((record) => ({
                ...record,
              })),
              outputFileIds,
            };
          }
        }
      } catch (error: any) {
        try {
          const handled = await handle422Error(error, (id) =>
            fileActions.markFileError(id as FileId),
          );
          if (handled) {
            actions.setStatus(
              "Process failed due to invalid/corrupted file(s)",
            );
            return;
          }
        } catch (_e) {
          void _e;
        }

        const errorMessage =
          config.getErrorMessage?.(error) || extractErrorMessage(error);
        actions.setError(errorMessage);
        actions.setStatus("");
      } finally {
        window.removeEventListener(
          FILE_EVENTS.markError,
          errorListener as EventListener,
        );
        actions.setLoading(false);
        actions.setProgress(null);
      }
    },
    [
      t,
      config,
      actions,
      addFiles,
      consumeFiles,
      navActions,
      processFiles,
      generateThumbnails,
      createDownloadInfo,
      cleanupBlobUrls,
      extractZipFiles,
      willUseCloud,
      checkCredits,
    ],
  );

  const cancelOperation = useCallback(() => {
    cancelApiCalls();
    actions.setLoading(false);
    actions.setProgress(null);
    actions.setStatus("Operation cancelled");
  }, [cancelApiCalls, actions]);

  const resetResults = useCallback(() => {
    cleanupBlobUrls();
    actions.resetResults();
    // Clear undo data when results are reset to prevent memory leaks
    lastOperationRef.current = null;
  }, [cleanupBlobUrls, actions]);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      lastOperationRef.current = null;
    };
  }, []);

  const undoOperation = useCallback(async () => {
    if (!lastOperationRef.current) {
      actions.setError(t("noOperationToUndo", "No operation to undo"));
      return;
    }

    const { inputFiles, inputStirlingFileStubs, outputFileIds } =
      lastOperationRef.current;

    // Validate that we have data to undo
    if (inputFiles.length === 0 || inputStirlingFileStubs.length === 0) {
      actions.setError(
        t("invalidUndoData", "Cannot undo: invalid operation data"),
      );
      return;
    }

    if (outputFileIds.length === 0) {
      actions.setError(
        t(
          "noFilesToUndo",
          "Cannot undo: no files were processed in the last operation",
        ),
      );
      return;
    }

    try {
      // Undo the consume operation
      await undoConsumeFiles(inputFiles, inputStirlingFileStubs, outputFileIds);

      // Clear results and operation tracking
      resetResults();
      lastOperationRef.current = null;

      // Show success message
      actions.setStatus(t("undoSuccess", "Operation undone successfully"));
    } catch (error: any) {
      let errorMessage = extractErrorMessage(error);

      // Provide more specific error messages based on error type
      if (error.message?.includes("Mismatch between input files")) {
        errorMessage = t(
          "undoDataMismatch",
          "Cannot undo: operation data is corrupted",
        );
      } else if (error.message?.includes("IndexedDB")) {
        errorMessage = t(
          "undoStorageError",
          "Undo completed but some files could not be saved to storage",
        );
      } else if (error.name === "QuotaExceededError") {
        errorMessage = t(
          "undoQuotaError",
          "Cannot undo: insufficient storage space",
        );
      }

      actions.setError(
        `${t("undoFailed", "Failed to undo operation")}: ${errorMessage}`,
      );

      // Don't clear the operation data if undo failed - user might want to try again
    }
  }, [undoConsumeFiles, resetResults, actions, t]);

  return {
    // State
    files: state.files,
    thumbnails: state.thumbnails,
    isGeneratingThumbnails: state.isGeneratingThumbnails,
    downloadUrl: state.downloadUrl,
    downloadFilename: state.downloadFilename,
    downloadLocalPath: state.downloadLocalPath,
    outputFileIds: state.outputFileIds,
    isLoading: state.isLoading,
    status: state.status,
    errorMessage: state.errorMessage,
    progress: state.progress,
    willUseCloud,

    // Actions
    executeOperation,
    resetResults,
    clearError: actions.clearError,
    cancelOperation,
    undoOperation,
  };
};
