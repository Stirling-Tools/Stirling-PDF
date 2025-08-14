import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileActions } from '../../../contexts/FileContext';
import { useToolState, type ProcessingProgress } from './useToolState';
import { useToolApiCalls, type ApiCallsConfig } from './useToolApiCalls';
import { useToolResources } from './useToolResources';
import { extractErrorMessage } from '../../../utils/toolErrorHandler';
import { createOperation } from '../../../utils/toolOperationTracker';
import { ResponseHandler } from '../../../utils/toolResponseProcessor';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

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
  buildFormData: ((params: TParams, file: File) => FormData) | ((params: TParams, files: File[]) => FormData);

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

  /** Validate parameters before execution. Return validation errors if invalid. */
  validateParams?: (params: TParams) => ValidationResult;

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
  const { actions: fileActions } = useFileActions();
  // Legacy compatibility - these functions might not be needed in the new architecture
  const recordOperation = (_fileId?: string, _operation?: any) => {}; // Placeholder
  const markOperationApplied = (_fileId?: string, _operationId?: string) => {}; // Placeholder
  const markOperationFailed = (_fileId?: string, _operationId?: string, _errorMessage?: string) => {}; // Placeholder

  // Composed hooks
  const { state, actions } = useToolState();
  const { processFiles, cancelOperation: cancelApiCalls } = useToolApiCalls<TParams>();
  const { generateThumbnails, generateThumbnailsWithMetadata, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles } = useToolResources();

  const executeOperation = useCallback(async (
    params: TParams,
    selectedFiles: File[]
  ): Promise<void> => {
    // Validation
    if (selectedFiles.length === 0) {
      actions.setError(t('noFileSelected', 'No files selected'));
      return;
    }

    if (config.validateParams) {
      const validation = config.validateParams(params);
      if (!validation.valid) {
        actions.setError(validation.errors?.join(', ') || 'Invalid parameters');
        return;
      }
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
          console.log(`🚀 useToolOperation: Multi-file processing for ${config.operationType} with ${validFiles.length} files`);
          actions.setStatus('Processing files...');
          const formData = (config.buildFormData as (params: TParams, files: File[]) => FormData)(params, validFiles);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
          console.log(`🚀 Calling endpoint: ${endpoint}`);

          const response = await axios.post(endpoint, formData, { responseType: 'blob' });
          console.log(`🚀 Received response: ${response.data.size} bytes, type: ${response.data.type}`);

          // Multi-file responses are typically ZIP files that need extraction
          if (config.responseHandler) {
            console.log(`🚀 Using custom responseHandler for ${config.operationType}`);
            // Use custom responseHandler for multi-file (handles ZIP extraction)
            processedFiles = await config.responseHandler(response.data, validFiles);
          } else {
            console.log(`🚀 Using default ZIP extraction for ${config.operationType}`);
            // Default: assume ZIP response for multi-file endpoints
            processedFiles = await extractZipFiles(response.data);
            console.log(`🚀 Extracted ${processedFiles.length} files from ZIP`);

            if (processedFiles.length === 0) {
              console.log(`🚀 ZIP extraction failed, trying generic fallback`);
              // Try the generic extraction as fallback
              processedFiles = await extractAllZipFiles(response.data);
              console.log(`🚀 Generic fallback extracted ${processedFiles.length} files`);
            }
          }
        } else {
          // Individual file processing - separate API call per file
          const apiCallsConfig: ApiCallsConfig<TParams> = {
            endpoint: config.endpoint,
            buildFormData: (file: File, params: TParams) => (config.buildFormData as any /* FIX ME */)(file, params),
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
        console.log(`🚀 useToolOperation: Processing complete. ${processedFiles.length} files ready for thumbnails:`, 
          processedFiles.map((f, i) => `[${i}]: ${f.name} (${f.type}, ${f.size} bytes)`));
        actions.setFiles(processedFiles);

        // Generate thumbnails with metadata and download URL concurrently
        actions.setGeneratingThumbnails(true);
        const [thumbnailResults, downloadInfo] = await Promise.all([
          generateThumbnailsWithMetadata(processedFiles),
          createDownloadInfo(processedFiles, config.operationType)
        ]);
        actions.setGeneratingThumbnails(false);

        // Extract thumbnails for tool state and page counts for context
        const thumbnails = thumbnailResults.map(r => r.thumbnail || '');
        const pageCounts = thumbnailResults.map(r => r.pageCount);

        console.log(`⚡ useToolOperation: Generated ${thumbnails.length} thumbnails with page counts for ${config.operationType}:`, 
          thumbnailResults.map((r, i) => `[${i}]: ${r.thumbnail ? 'PRESENT' : 'MISSING'} (${r.pageCount} pages)`));
        actions.setThumbnails(thumbnails);
        actions.setDownloadInfo(downloadInfo.url, downloadInfo.filename);

        // Add to file context WITH pre-existing thumbnails AND page counts to avoid duplicate processing
        const filesWithMetadata = processedFiles.map((file, index) => ({
          file,
          thumbnail: thumbnails[index] || undefined,
          pageCount: pageCounts[index] || undefined
        }));
        console.log(`📄 useToolOperation: Adding ${filesWithMetadata.length} processed files with pre-existing thumbnails and page counts to context`);
        await fileActions.addProcessedFiles(filesWithMetadata);

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
  }, [t, config, actions, processFiles, generateThumbnailsWithMetadata, createDownloadInfo, cleanupBlobUrls, extractZipFiles, extractAllZipFiles, fileActions.addProcessedFiles]);

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
