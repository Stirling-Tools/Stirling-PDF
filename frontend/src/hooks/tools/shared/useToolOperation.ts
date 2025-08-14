import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { useToolState, type ProcessingProgress } from './useToolState';
import { useToolApiCalls, type ApiCallsConfig } from './useToolApiCalls';
import { useToolResources } from './useToolResources';
import { extractErrorMessage } from '../../../utils/toolErrorHandler';
import { createOperation } from '../../../utils/toolOperationTracker';
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
  executeOperation: (params: TParams, selectedFiles: File[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
  cancelOperation: () => void;
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
  const { recordOperation, markOperationApplied, markOperationFailed, addFiles, consumeFiles } = useFileContext();

  // Composed hooks
  const { state, actions } = useToolState();
  const { processFiles, cancelOperation: cancelApiCalls } = useToolApiCalls<TParams>();
  const { generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles } = useToolResources();

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

    try {
      let processedFiles: File[];

      if (config.customProcessor) {
        actions.setStatus('Processing files...');
        processedFiles = await config.customProcessor(params, validFiles);
      } else {
        // Use explicit multiFileEndpoint flag to determine processing approach
        if (config.multiFileEndpoint) {
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = (config.buildFormData as (params: TParams, files: File[]) => FormData)(params, validFiles);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;

          const response = await axios.post(endpoint, formData, { responseType: 'blob' });

          // Multi-file responses are typically ZIP files that need extraction
          if (config.responseHandler) {
            // Use custom responseHandler for multi-file (handles ZIP extraction)
            processedFiles = await config.responseHandler(response.data, validFiles);
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
            validFiles,
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

        // Consume input files and add output files (will replace unpinned inputs)
        await consumeFiles(validFiles, processedFiles);

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
  }, [t, config, actions, recordOperation, markOperationApplied, markOperationFailed, addFiles, processFiles, generateThumbnails, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles]);

  const cancelOperation = useCallback(() => {
    cancelApiCalls();
    actions.setLoading(false);
    actions.setProgress(null);
    actions.setStatus('Operation cancelled');
  }, [cancelApiCalls, actions]);

  const resetResults = useCallback(() => {
    cleanupBlobUrls();
    actions.resetResults();
  }, [cleanupBlobUrls, actions]);

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
    cancelOperation
  };
};
