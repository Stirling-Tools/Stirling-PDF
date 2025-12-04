import { useCallback, useRef, useEffect } from 'react';
import apiClient from '@app/services/apiClient';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '@app/contexts/FileContext';
import { useToolState, type ProcessingProgress } from '@app/hooks/tools/shared/useToolState';
import { useToolApiCalls, type ApiCallsConfig } from '@app/hooks/tools/shared/useToolApiCalls';
import { useToolResources } from '@app/hooks/tools/shared/useToolResources';
import { extractErrorMessage } from '@app/utils/toolErrorHandler';
import { StirlingFile, extractFiles, FileId, StirlingFileStub, createStirlingFile } from '@app/types/fileContext';
import { FILE_EVENTS } from '@app/services/errorUtils';
import { getFilenameWithoutExtension } from '@app/utils/fileUtils';
import { ResponseHandler } from '@app/utils/toolResponseProcessor';
import { createChildStub, generateProcessedFileMetadata } from '@app/contexts/file/fileActions';
import { ToolOperation } from '@app/types/file';
import { ToolId } from '@app/types/toolId';
import { ensureBackendReady } from '@app/services/backendReadinessGuard';

// Re-export for backwards compatibility
export type { ProcessingProgress, ResponseHandler };

export enum ToolType {
  singleFile,
  multiFile,
  custom,
}

/**
 * Result from custom processor with optional metadata about input consumption.
 */
export interface CustomProcessorResult {
  /** Processed output files */
  files: File[];
  /**
   * When true, marks all input files as successfully consumed regardless of output count.
   * Use when operation combines N inputs into fewer outputs (e.g., 3 images → 1 PDF).
   * When false/undefined, uses filename-based mapping to determine which inputs succeeded.
   */
  consumedAllInputs?: boolean;
}

/**
 * Configuration for tool operations defining processing behavior and API integration.
 *
 * Supports three patterns:
 * 1. Single-file tools: multiFileEndpoint: false, processes files individually
 * 2. Multi-file tools: multiFileEndpoint: true, single API call with all files
 * 3. Complex tools: customProcessor handles all processing logic
 */
interface BaseToolOperationConfig<TParams> {
  /** Operation identifier for tracking and logging */
  operationType: ToolId;

  /**
   * Prefix added to processed filenames (e.g., 'compressed_', 'split_').
   * Only generally useful for multiFile interfaces.
   */
  filePrefix?: string;

  /**
   * Whether to preserve the filename provided by the backend in response headers.
   * When true, ignores filePrefix and uses the filename from Content-Disposition header.
   * Useful for tools like auto-rename where the backend determines the final filename.
   */
  preserveBackendFilename?: boolean;

  /** How to handle API responses (e.g., ZIP extraction, single file response) */
  responseHandler?: ResponseHandler;

  /** Extract user-friendly error messages from API errors */
  getErrorMessage?: (error: any) => string;

  /** Default parameter values for automation */
  defaultParameters?: TParams;
}

export interface SingleFileToolOperationConfig<TParams> extends BaseToolOperationConfig<TParams> {
  /** This tool processes one file at a time. */
  toolType: ToolType.singleFile;

  /** Builds FormData for API request. */
  buildFormData: ((params: TParams, file: File) => FormData);

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface MultiFileToolOperationConfig<TParams> extends BaseToolOperationConfig<TParams> {
  /** This tool processes multiple files at once. */
  toolType: ToolType.multiFile;

  /** Prefix added to processed filename (e.g., 'merged_', 'split_') */
  filePrefix: string;

  /** Builds FormData for API request. */
  buildFormData: ((params: TParams, files: File[]) => FormData);

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface CustomToolOperationConfig<TParams> extends BaseToolOperationConfig<TParams> {
  /** This tool has custom behaviour. */
  toolType: ToolType.custom;

  buildFormData?: undefined;
  endpoint?: undefined;

  /**
   * Custom processing logic that completely bypasses standard file processing.
   * This tool handles all API calls, response processing, and file creation.
   * Use for tools with complex routing logic or non-standard processing requirements.
   *
   * Returns CustomProcessorResult with:
   * - files: Processed output files
   * - consumedAllInputs: true if operation combines N inputs → fewer outputs
   */
  customProcessor: (params: TParams, files: File[]) => Promise<CustomProcessorResult>;
}

export type ToolOperationConfig<TParams = void> = SingleFileToolOperationConfig<TParams> | MultiFileToolOperationConfig<TParams> | CustomToolOperationConfig<TParams>;

/**
 * Complete tool operation interface with execution capability
 */
export interface ToolOperationHook<TParams = void> {
  // State
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  isLoading: boolean;
  status: string;
  errorMessage: string | null;
  progress: ProcessingProgress | null;

  // Actions
  executeOperation: (params: TParams, selectedFiles: StirlingFile[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
  cancelOperation: () => void;
  undoOperation: () => Promise<void>;
}

// Re-export for backwards compatibility
export { createStandardErrorHandler } from '@app/utils/toolErrorHandler';

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
  config: ToolOperationConfig<TParams>
): ToolOperationHook<TParams> => {
  const { t } = useTranslation();
  const { addFiles, consumeFiles, undoConsumeFiles, selectors } = useFileContext();

  // Composed hooks
  const { state, actions } = useToolState();
  const { actions: fileActions } = useFileContext();
  const { processFiles, cancelOperation: cancelApiCalls } = useToolApiCalls<TParams>();
  const { generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles } = useToolResources();

  // Track last operation for undo functionality
  const lastOperationRef = useRef<{
    inputFiles: File[];
    inputStirlingFileStubs: StirlingFileStub[];
    outputFileIds: FileId[];
  } | null>(null);

  const executeOperation = useCallback(async (
    params: TParams,
    selectedFiles: StirlingFile[]
  ): Promise<void> => {
    // Validation
    if (selectedFiles.length === 0) {
      actions.setError(t('noFileSelected', 'No files selected'));
      return;
    }

    // Handle zero-byte inputs explicitly: mark as error and continue with others
    const zeroByteFiles = selectedFiles.filter(file => file.size === 0);
    if (zeroByteFiles.length > 0) {
      try {
        for (const f of zeroByteFiles) {
          fileActions.markFileError(f.fileId);
        }
      } catch (e) {
        console.log('markFileError', e);
      }
    }
    const validFiles: StirlingFile[] = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      actions.setError(t('noValidFiles', 'No valid files to process'));
      return;
    }

    const backendReady = await ensureBackendReady();
    if (!backendReady) {
      actions.setError(t('backendHealth.offline', 'Embedded backend is offline. Please try again shortly.'));
      return;
    }

    // Reset state
    actions.setLoading(true);
    actions.setError(null);
    actions.resetResults();
    cleanupBlobUrls();

    // Prepare files with history metadata injection (for PDFs)
    actions.setStatus('Processing files...');

    // Listen for global error file id events from HTTP interceptor during this run
    let externalErrorFileIds: string[] = [];
    const errorListener = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as any;
      if (detail?.fileIds) {
        externalErrorFileIds = Array.isArray(detail.fileIds) ? detail.fileIds : [];
      }
    };
    window.addEventListener(FILE_EVENTS.markError, errorListener as EventListener);

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
            preserveBackendFilename: config.preserveBackendFilename
          };
          console.debug('[useToolOperation] Multi-file start', { count: filesForAPI.length });
          const result = await processFiles(
            params,
            validFiles,
            apiCallsConfig,
            actions.setProgress,
            actions.setStatus,
            fileActions.markFileError
          );
          processedFiles = result.outputFiles;
          successSourceIds = result.successSourceIds;
          console.debug('[useToolOperation] Multi-file results', { outputFiles: processedFiles.length, successSources: result.successSourceIds.length });
          break;
        }
        case ToolType.multiFile: {
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = config.buildFormData(params, filesForAPI);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;

          const response = await apiClient.post(endpoint, formData, { responseType: 'blob' });

          // Multi-file responses are typically ZIP files that need extraction, but some may return single PDFs
          if (config.responseHandler) {
            // Use custom responseHandler for multi-file (handles ZIP extraction)
            processedFiles = await config.responseHandler(response.data, filesForAPI);
          } else if (response.data.type === 'application/pdf' ||
                    (response.headers && response.headers['content-type'] === 'application/pdf')) {
            // Single PDF response (e.g. split with merge option) - add prefix to first original filename
            const filename = `${config.filePrefix}${filesForAPI[0]?.name || 'document.pdf'}`;
            const singleFile = new File([response.data], filename, { type: 'application/pdf' });
            processedFiles = [singleFile];
          } else {
            // Default: assume ZIP response for multi-file endpoints
            // Note: extractZipFiles will check preferences.autoUnzip setting
            processedFiles = await extractZipFiles(response.data);
          }
          // Assume all inputs succeeded together unless server provided an error earlier
          successSourceIds = validFiles.map(f => f.fileId);
          break;
        }

        case ToolType.custom: {
          actions.setStatus('Processing files...');
          const result = await config.customProcessor(params, filesForAPI);

          processedFiles = result.files;
          const consumedAllInputs = result.consumedAllInputs || false;

          // If consumedAllInputs flag is set, mark all inputs as successful
          // (used for operations that combine N inputs into fewer outputs)
          if (consumedAllInputs) {
            successSourceIds = validFiles.map(f => f.fileId);
          } else {
            // Try to map outputs back to inputs by filename (before extension)
            const inputBaseNames = new Map<string, FileId>();
            for (const f of validFiles) {
              const base = getFilenameWithoutExtension(f.name || '');
              inputBaseNames.set(base, f.fileId);
            }
            const mappedSuccess: FileId[] = [];
            for (const out of processedFiles) {
              const base = getFilenameWithoutExtension(out.name || '');
              const id = inputBaseNames.get(base);
              if (id) mappedSuccess.push(id);
            }
            // Fallback to naive alignment if names don't match
            if (mappedSuccess.length === 0) {
              successSourceIds = validFiles.slice(0, processedFiles.length).map(f => f.fileId);
            } else {
              successSourceIds = mappedSuccess;
            }
          }
          break;
        }
      }

      // Normalize error flags across tool types: mark failures, clear successes
      try {
        const allInputIds = validFiles.map(f => f.fileId);
        const okSet = new Set(successSourceIds);
        // Clear errors on successes
        for (const okId of okSet) {
          try { fileActions.clearFileError(okId); } catch (_e) { void _e; }
        }
        // Mark errors on inputs that didn't succeed
        for (const id of allInputIds) {
          if (!okSet.has(id)) {
            try { fileActions.markFileError(id); } catch (_e) { void _e; }
          }
        }
      } catch (_e) { void _e; }

      if (externalErrorFileIds.length > 0) {
        // If backend told us which sources failed, prefer that mapping
        successSourceIds = validFiles
          .map(f => f.fileId)
          .filter(id => !externalErrorFileIds.includes(id));
        // Also mark failed IDs immediately
        try {
          for (const badId of externalErrorFileIds) {
            fileActions.markFileError(badId as FileId);
          }
        } catch (_e) { void _e; }
      }

      if (processedFiles.length > 0) {
        actions.setFiles(processedFiles);


        // Generate thumbnails and download URL concurrently
        actions.setGeneratingThumbnails(true);
        const [thumbnails, downloadInfo] = await Promise.all([
          generateThumbnails(processedFiles),
          createDownloadInfo(processedFiles, config.operationType)
        ]);
        actions.setGeneratingThumbnails(false);

        actions.setThumbnails(thumbnails);
        actions.setDownloadInfo(downloadInfo.url, downloadInfo.filename);

        // Replace input files with processed files (consumeFiles handles pinning)
        const inputFileIds: FileId[] = [];
        const inputStirlingFileStubs: StirlingFileStub[] = [];

        // Build parallel arrays of IDs and records for undo tracking
        for (const file of validFiles) {
          const fileId = file.fileId;
          const record = selectors.getStirlingFileStub(fileId);
          if (record) {
            inputFileIds.push(fileId);
            inputStirlingFileStubs.push(record);
          } else {
            console.warn(`No file stub found for file: ${file.name}`);
          }
        }

        // Create new tool operation
        const newToolOperation: ToolOperation = {
          toolId: config.operationType,
          timestamp: Date.now()
        };

        // Generate fresh processedFileMetadata for all processed files to ensure accuracy
        actions.setStatus('Generating metadata for processed files...');
        const processedFileMetadataArray = await Promise.all(
          processedFiles.map(file => generateProcessedFileMetadata(file))
        );
        // Always create child stubs linking back to the successful source inputs
        const successInputStubs = successSourceIds
          .map((id) => selectors.getStirlingFileStub(id))
          .filter(Boolean) as StirlingFileStub[];

        if (successInputStubs.length !== processedFiles.length) {
          console.warn('[useToolOperation] Mismatch successInputStubs vs outputs', {
            successInputStubs: successInputStubs.length,
            outputs: processedFiles.length,
          });
        }

        const outputStirlingFileStubs = processedFiles.map((resultingFile, index) =>
          createChildStub(
            successInputStubs[index] || inputStirlingFileStubs[index] || inputStirlingFileStubs[0],
            newToolOperation,
            resultingFile,
            thumbnails[index],
            processedFileMetadataArray[index]
          )
        );

        // Create StirlingFile objects from processed files and child stubs
        const outputStirlingFiles = processedFiles.map((file, index) => {
          const childStub = outputStirlingFileStubs[index];
          return createStirlingFile(file, childStub.id);
        });
        // Build consumption arrays aligned to the successful source IDs
        const toConsumeInputIds = successSourceIds.filter((id) => inputFileIds.includes(id));
        // Outputs and stubs are already ordered by success sequence
        console.debug('[useToolOperation] Consuming files', { inputCount: inputFileIds.length, toConsume: toConsumeInputIds.length });
        const outputFileIds = await consumeFiles(toConsumeInputIds, outputStirlingFiles, outputStirlingFileStubs);

        // Store operation data for undo (only store what we need to avoid memory bloat)
        lastOperationRef.current = {
          inputFiles: extractFiles(validFiles), // Convert to File objects for undo
          inputStirlingFileStubs: inputStirlingFileStubs.map(record => ({ ...record })), // Deep copy to avoid reference issues
          outputFileIds
        };

      }

    } catch (error: any) {
      // Centralized 422 handler: mark provided IDs in errorFileIds
      try {
        const status = error?.response?.status;
        if (typeof status === 'number' && status === 422) {
          const payload = error?.response?.data;
          let parsed: unknown = payload;
          if (typeof payload === 'string') {
            try { parsed = JSON.parse(payload); } catch { parsed = payload; }
          } else if (payload && typeof (payload as Blob).text === 'function') {
            // Blob or Response-like object from axios when responseType='blob'
            const text = await (payload as Blob).text();
            try { parsed = JSON.parse(text); } catch { parsed = text; }
          }
          let ids: string[] | undefined = Array.isArray((parsed as { errorFileIds?: unknown })?.errorFileIds)
            ? (parsed as { errorFileIds: string[] }).errorFileIds
            : undefined;
          if (!ids && typeof parsed === 'string') {
            const match = parsed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g);
            if (match && match.length > 0) ids = Array.from(new Set(match));
          }
          if (ids && ids.length > 0) {
            for (const badId of ids) {
              try { fileActions.markFileError(badId as FileId); } catch (_e) { void _e; }
            }
            actions.setStatus('Process failed due to invalid/corrupted file(s)');
            // Avoid duplicating toast messaging here
            return;
          }
        }
      } catch (_e) { void _e; }

      const errorMessage = config.getErrorMessage?.(error) || extractErrorMessage(error);
      actions.setError(errorMessage);
      actions.setStatus('');
    } finally {
      window.removeEventListener(FILE_EVENTS.markError, errorListener as EventListener);
      actions.setLoading(false);
      actions.setProgress(null);
    }
  }, [t, config, actions, addFiles, consumeFiles, processFiles, generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles]);

  const cancelOperation = useCallback(() => {
    cancelApiCalls();
    actions.setLoading(false);
    actions.setProgress(null);
    actions.setStatus('Operation cancelled');
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
      actions.setError(t('noOperationToUndo', 'No operation to undo'));
      return;
    }

    const { inputFiles, inputStirlingFileStubs, outputFileIds } = lastOperationRef.current;

    // Validate that we have data to undo
    if (inputFiles.length === 0 || inputStirlingFileStubs.length === 0) {
      actions.setError(t('invalidUndoData', 'Cannot undo: invalid operation data'));
      return;
    }

    if (outputFileIds.length === 0) {
      actions.setError(t('noFilesToUndo', 'Cannot undo: no files were processed in the last operation'));
      return;
    }

    try {
      // Undo the consume operation
      await undoConsumeFiles(inputFiles, inputStirlingFileStubs, outputFileIds);


      // Clear results and operation tracking
      resetResults();
      lastOperationRef.current = null;

      // Show success message
      actions.setStatus(t('undoSuccess', 'Operation undone successfully'));

    } catch (error: any) {
      let errorMessage = extractErrorMessage(error);

      // Provide more specific error messages based on error type
      if (error.message?.includes('Mismatch between input files')) {
        errorMessage = t('undoDataMismatch', 'Cannot undo: operation data is corrupted');
      } else if (error.message?.includes('IndexedDB')) {
        errorMessage = t('undoStorageError', 'Undo completed but some files could not be saved to storage');
      } else if (error.name === 'QuotaExceededError') {
        errorMessage = t('undoQuotaError', 'Cannot undo: insufficient storage space');
      }

      actions.setError(`${t('undoFailed', 'Failed to undo operation')}: ${errorMessage}`);

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
    isLoading: state.isLoading,
    status: state.status,
    errorMessage: state.errorMessage,
    progress: state.progress,

    // Actions
    executeOperation,
    resetResults,
    clearError: actions.clearError,
    cancelOperation,
    undoOperation
  };
};
