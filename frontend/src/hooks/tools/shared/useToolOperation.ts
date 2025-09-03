import { useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { useToolState, type ProcessingProgress } from './useToolState';
import { useToolApiCalls, type ApiCallsConfig } from './useToolApiCalls';
import { useToolResources } from './useToolResources';
import { extractErrorMessage } from '../../../utils/toolErrorHandler';
import { FileWithId, extractFiles, FileId, FileRecord } from '../../../types/fileContext';
import { ResponseHandler } from '../../../utils/toolResponseProcessor';

// Re-export for backwards compatibility
export type { ProcessingProgress, ResponseHandler };

/**
 * Configuration for tool operations defining processing behavior and API integration.
 *
 * Supports three patterns:
 * 1. Single-file tools: multiFileEndpoint: false, processes files individually
 * 2. Multi-file tools: multiFileEndpoint: true, single API call with all files
 * 3. Complex tools: customProcessor handles all processing logic
 */
export interface ToolOperationConfig<TParams = void> {
  /** Operation identifier for tracking and logging */
  operationType: string;

  /**
   * API endpoint for the operation. Can be static string or function for dynamic routing.
   * Not used when customProcessor is provided.
   */
  endpoint: string | ((params: TParams) => string);

  /**
   * Builds FormData for API request. Signature determines processing approach:
   * - (params, file: File) => FormData: Single-file processing
   * - (params, files: File[]) => FormData: Multi-file processing
   * Not used when customProcessor is provided.
   */
  buildFormData: ((params: TParams, file: File) => FormData) | ((params: TParams, files: File[]) => FormData); /* FIX ME */

  /** Prefix added to processed filenames (e.g., 'compressed_', 'split_') */
  filePrefix: string;

  /**
   * Whether this tool uses backends that accept MultipartFile[] arrays.
   * - true: Single API call with all files (backend uses MultipartFile[])
   * - false/undefined: Individual API calls per file (backend uses single MultipartFile)
   * Ignored when customProcessor is provided.
   */
  multiFileEndpoint?: boolean;

  /** How to handle API responses (e.g., ZIP extraction, single file response) */
  responseHandler?: ResponseHandler;

  /**
   * Custom processing logic that completely bypasses standard file processing.
   * When provided, tool handles all API calls, response processing, and file creation.
   * Use for tools with complex routing logic or non-standard processing requirements.
   */
  customProcessor?: (params: TParams, files: File[]) => Promise<File[]>;

  /** Extract user-friendly error messages from API errors */
  getErrorMessage?: (error: any) => string;

  /** Default parameter values for automation */
  defaultParameters?: TParams;
}

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
  executeOperation: (params: TParams, selectedFiles: FileWithId[]) => Promise<void>;
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
export const useToolOperation = <TParams = void>(
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
    selectedFiles: FileWithId[]
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


    // Reset state
    actions.setLoading(true);
    actions.setError(null);
    actions.resetResults();
    cleanupBlobUrls();

    try {
      let processedFiles: File[];

      const validRegularFiles = extractFiles(validFiles);

      if (config.customProcessor) {
        actions.setStatus('Processing files...');
        processedFiles = await config.customProcessor(params, validRegularFiles);
      } else {
        // Use explicit multiFileEndpoint flag to determine processing approach
        if (config.multiFileEndpoint) {
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = (config.buildFormData as (params: TParams, files: File[]) => FormData)(params, validRegularFiles);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;

          const response = await axios.post(endpoint, formData, { responseType: 'blob' });

          // Multi-file responses are typically ZIP files that need extraction, but some may return single PDFs
          if (config.responseHandler) {
            // Use custom responseHandler for multi-file (handles ZIP extraction)
            processedFiles = await config.responseHandler(response.data, validFiles);
          } else if (response.data.type === 'application/pdf' ||
                     (response.headers && response.headers['content-type'] === 'application/pdf')) {
            // Single PDF response (e.g. split with merge option) - use original filename
            const originalFileName = validRegularFiles[0]?.name || 'document.pdf';
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
        } else {
          // Individual file processing - separate API call per file
          const apiCallsConfig: ApiCallsConfig<TParams> = {
            endpoint: config.endpoint,
            buildFormData: config.buildFormData as (params: TParams, file: File) => FormData,
            filePrefix: config.filePrefix,
            responseHandler: config.responseHandler
          };
          processedFiles = await processFiles(
            params,
            validRegularFiles,
            apiCallsConfig,
            actions.setProgress,
            actions.setStatus
          );
        }
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

      }

    } catch (error: any) {
      const errorMessage = config.getErrorMessage?.(error) || extractErrorMessage(error);
      actions.setError(errorMessage);
      actions.setStatus('');
    } finally {
      actions.setLoading(false);
      actions.setProgress(null);
    }
  }, [t, config, actions, addFiles, consumeFiles, processFiles, generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles]);

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
