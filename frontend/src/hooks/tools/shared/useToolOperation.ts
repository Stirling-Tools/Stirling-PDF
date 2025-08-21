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

export type ToolConfigType = 'singleFile' | 'multiFile' | 'custom';

/**
 * Configuration for tool operations defining processing behavior and API integration.
 *
 * Supports three patterns:
 * 1. Single-file tools: multiFileEndpoint: false, processes files individually
 * 2. Multi-file tools: multiFileEndpoint: true, single API call with all files
 * 3. Complex tools: customProcessor handles all processing logic
 */
interface BaseToolOperationConfig {
  /** Operation identifier for tracking and logging */
  operationType: string;

  /** Prefix added to processed filenames (e.g., 'compressed_', 'split_') */
  filePrefix: string;

  /** How to handle API responses (e.g., ZIP extraction, single file response) */
  responseHandler?: ResponseHandler;

  /** Extract user-friendly error messages from API errors */
  getErrorMessage?: (error: any) => string;
}

export interface SingleFileToolOperationConfig<TParams> extends BaseToolOperationConfig {
  /** This tool processes one file at a time. */
  toolType: 'singleFile';

  /** Builds FormData for API request. */
  buildFormData: ((params: TParams, file: File) => FormData);

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface MultiFileToolOperationConfig<TParams> extends BaseToolOperationConfig {
  /** This tool processes multiple files at once. */
  toolType: 'multiFile';

  /** Builds FormData for API request. */
  buildFormData: ((params: TParams, files: File[]) => FormData);

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface CustomToolOperationConfig<TParams> extends BaseToolOperationConfig {
  /** This tool has custom behaviour. */
  toolType: 'custom';

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

      switch (config.toolType) {
        case 'singleFile':
          // Individual file processing - separate API call per file
          const apiCallsConfig: ApiCallsConfig<TParams> = {
            endpoint: config.endpoint,
            buildFormData: config.buildFormData,
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
          break;

        case 'multiFile':
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = config.buildFormData(params, validFiles);
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
          break;

        case 'custom':
          actions.setStatus('Processing files...');
          processedFiles = await config.customProcessor(params, validFiles);
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
