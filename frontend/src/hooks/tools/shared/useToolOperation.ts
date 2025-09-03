import { useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { useToolState, type ProcessingProgress } from './useToolState';
import { useToolApiCalls, type ApiCallsConfig } from './useToolApiCalls';
import { useToolResources } from './useToolResources';
import { extractErrorMessage } from '../../../utils/toolErrorHandler';
import { createOperation } from '../../../utils/toolOperationTracker';
import { ResponseHandler } from '../../../utils/toolResponseProcessor';
import { FileId } from '../../../types/file';
import { FileRecord } from '../../../types/fileContext';
import { prepareFilesWithHistory } from '../../../utils/fileHistoryUtils';

// Re-export for backwards compatibility
export type { ProcessingProgress, ResponseHandler };

export enum ToolType {
  singleFile,
  multiFile,
  custom,
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
  operationType: string;

  /** Prefix added to processed filenames (e.g., 'compressed_', 'split_') */
  filePrefix?: string;

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
   */
  customProcessor: (params: TParams, files: File[]) => Promise<File[]>;
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
  executeOperation: (params: TParams, selectedFiles: File[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
  cancelOperation: () => void;
  undoOperation: () => Promise<void>;
}

// Re-export for backwards compatibility
export { createStandardErrorHandler } from '../../../utils/toolErrorHandler';

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
  const { recordOperation, markOperationApplied, markOperationFailed, addFiles, consumeFiles, undoConsumeFiles, findFileId, actions: fileActions, selectors } = useFileContext();

  // Composed hooks
  const { state, actions } = useToolState();
  const { processFiles, cancelOperation: cancelApiCalls } = useToolApiCalls<TParams>();
  const { generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles } = useToolResources();

  // Track last operation for undo functionality
  const lastOperationRef = useRef<{
    inputFiles: File[];
    inputFileRecords: FileRecord[];
    outputFileIds: FileId[];
  } | null>(null);

  const executeOperation = useCallback(async (
    params: TParams,
    selectedFiles: File[]
  ): Promise<void> => {
    // Validation
    if (selectedFiles.length === 0) {
      actions.setError(t('noFileSelected', 'No files selected'));
      return;
    }

    const validFiles = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      actions.setError(t('noValidFiles', 'No valid files to process'));
      return;
    }

    // Setup operation tracking
    const { operation, operationId, fileId } = createOperation(config.operationType, params, selectedFiles);
    recordOperation(fileId, operation);

    // Reset state
    actions.setLoading(true);
    actions.setError(null);
    actions.resetResults();
    cleanupBlobUrls();

    // Prepare files with history metadata injection (for PDFs)
    actions.setStatus('Preparing files...');
    const getFileRecord = (file: File) => {
      const fileId = findFileId(file);
      return fileId ? selectors.getFileRecord(fileId) : undefined;
    };

    const filesWithHistory = await prepareFilesWithHistory(
      validFiles,
      getFileRecord,
      config.operationType,
      params as Record<string, any>
    );

    try {
      let processedFiles: File[];

      switch (config.toolType) {
        case ToolType.singleFile:
          // Individual file processing - separate API call per file
          const apiCallsConfig: ApiCallsConfig<TParams> = {
            endpoint: config.endpoint,
            buildFormData: config.buildFormData,
            filePrefix: config.filePrefix,
            responseHandler: config.responseHandler
          };
          processedFiles = await processFiles(
            params,
            filesWithHistory,
            apiCallsConfig,
            actions.setProgress,
            actions.setStatus
          );
          break;

        case ToolType.multiFile:
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = config.buildFormData(params, filesWithHistory);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;

          const response = await axios.post(endpoint, formData, { responseType: 'blob' });

          // Multi-file responses are typically ZIP files that need extraction, but some may return single PDFs
          if (config.responseHandler) {
            // Use custom responseHandler for multi-file (handles ZIP extraction)
            processedFiles = await config.responseHandler(response.data, filesWithHistory);
          } else if (response.data.type === 'application/pdf' ||
                     (response.headers && response.headers['content-type'] === 'application/pdf')) {
            // Single PDF response (e.g. split with merge option) - use original filename
            const originalFileName = filesWithHistory[0]?.name || 'document.pdf';
            const singleFile = new File([response.data], originalFileName, { type: 'application/pdf' });
            processedFiles = [singleFile];
          } else {
            // Default: assume ZIP response for multi-file endpoints
            processedFiles = await extractZipFiles(response.data);

            if (processedFiles.length === 0) {
              // Try the generic extraction as fallback
              processedFiles = await extractAllZipFiles(response.data);
            }
          }
          break;

        case ToolType.custom:
          actions.setStatus('Processing files...');
          processedFiles = await config.customProcessor(params, filesWithHistory);
          break;
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
        const inputFileRecords: FileRecord[] = [];

        // Build parallel arrays of IDs and records for undo tracking
        for (const file of validFiles) {
          const fileId = findFileId(file);
          if (fileId) {
            const record = selectors.getFileRecord(fileId);
            if (record) {
              inputFileIds.push(fileId);
              inputFileRecords.push(record);
            } else {
              console.warn(`No file record found for file: ${file.name}`);
            }
          } else {
            console.warn(`No file ID found for file: ${file.name}`);
          }
        }

        const outputFileIds = await consumeFiles(inputFileIds, processedFiles);

        // Store operation data for undo (only store what we need to avoid memory bloat)
        lastOperationRef.current = {
          inputFiles: validFiles, // Keep original File objects for undo
          inputFileRecords: inputFileRecords.map(record => ({ ...record })), // Deep copy to avoid reference issues
          outputFileIds
        };

        markOperationApplied(fileId, operationId);
      }

    } catch (error: any) {
      const errorMessage = config.getErrorMessage?.(error) || extractErrorMessage(error);
      actions.setError(errorMessage);
      actions.setStatus('');
      markOperationFailed(fileId, operationId, errorMessage);
    } finally {
      actions.setLoading(false);
      actions.setProgress(null);
    }
  }, [t, config, actions, recordOperation, markOperationApplied, markOperationFailed, addFiles, consumeFiles, findFileId, processFiles, generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles]);

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

    const { inputFiles, inputFileRecords, outputFileIds } = lastOperationRef.current;

    // Validate that we have data to undo
    if (inputFiles.length === 0 || inputFileRecords.length === 0) {
      actions.setError(t('invalidUndoData', 'Cannot undo: invalid operation data'));
      return;
    }

    if (outputFileIds.length === 0) {
      actions.setError(t('noFilesToUndo', 'Cannot undo: no files were processed in the last operation'));
      return;
    }

    try {
      // Undo the consume operation
      await undoConsumeFiles(inputFiles, inputFileRecords, outputFileIds);

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
