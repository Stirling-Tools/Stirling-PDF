import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { useToolState, type ProcessingProgress } from './useToolState';
import { useToolApiCalls, type ApiCallsConfig } from './useToolApiCalls';
import { useToolResources } from './useToolResources';
import { extractErrorMessage } from '../../../utils/toolErrorHandler';
import { createOperation } from '../../../utils/toolOperationTracker';
import type { ResponseHandler } from '../../../utils/toolResponseProcessor';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// Re-export for backwards compatibility
export type { ProcessingProgress, ResponseHandler };

/**
 * Configuration for tool operations defining processing behavior and API integration
 */
export interface ToolOperationConfig<TParams = void> {
  /** Operation identifier for tracking and logging */
  operationType: string;
  
  /** API endpoint for the operation (can be string or function for dynamic endpoints) */
  endpoint: string | ((params: TParams) => string);
  
  /** Builds FormData for API request - signature indicates single-file vs multi-file capability */
  buildFormData: ((params: TParams, file: File) => FormData) | ((params: TParams, files: File[]) => FormData);
  
  /** Prefix for processed filenames (e.g., 'compressed_', 'repaired_') */
  filePrefix: string;
  
  /** How to handle API responses */
  responseHandler?: ResponseHandler;
  
  /** Process files individually or as a batch */
  singleFileMode?: boolean;
  
  /** Custom processing logic that bypasses default file processing */
  customProcessor?: (params: TParams, files: File[]) => Promise<File[]>;
  
  /** Validate parameters before execution */
  validateParams?: (params: TParams) => ValidationResult;
  
  /** Extract user-friendly error messages */
  getErrorMessage?: (error: any) => string;
  
  /** Request timeout in milliseconds */
  timeout?: number;
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
 * Shared hook for tool operations with consistent error handling, progress tracking,
 * and FileContext integration. Eliminates boilerplate while maintaining flexibility.
 */
export const useToolOperation = <TParams = void>(
  config: ToolOperationConfig<TParams>
): ToolOperationHook<TParams> => {
  const { t } = useTranslation();
  const { recordOperation, markOperationApplied, markOperationFailed, addFiles } = useFileContext();
  
  // Composed hooks
  const { state, actions } = useToolState();
  const { processFiles, cancelOperation: cancelApiCalls } = useToolApiCalls<TParams>();
  const { generateThumbnails, createDownloadInfo, cleanupBlobUrls } = useToolResources();

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
        // Detect if buildFormData signature is multi-file or single-file
        // Both have 2 params now, so check if second param expects an array
        const isMultiFileFormData = /files|selectedFiles/.test(config.buildFormData.toString());
        
        if (isMultiFileFormData) {
          // Multi-file processing - single API call with all files
          actions.setStatus('Processing files...');
          const formData = (config.buildFormData as (params: TParams, files: File[]) => FormData)(params, validFiles);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
          
          const response = await axios.post(endpoint, formData, { responseType: 'blob' });
          
          // Handle response based on responseHandler
          if (config.responseHandler?.type === 'zip' && config.responseHandler?.useZipExtractor) {
            const zipFile = new File([response.data], 'results.zip', { type: 'application/zip' });
            const { zipFileService } = await import('../../../services/zipFileService');
            const extractionResult = await zipFileService.extractPdfFiles(zipFile);
            processedFiles = extractionResult.success ? extractionResult.extractedFiles : [];
          } else {
            // Single file response
            const filename = validFiles.length === 1 
              ? `${config.filePrefix}${validFiles[0].name}`
              : `${config.filePrefix}result.pdf`;
            processedFiles = [new File([response.data], filename, { type: response.data.type })];
          }
        } else {
          // Individual file processing - separate API call per file
          const apiCallsConfig: ApiCallsConfig<TParams> = {
            endpoint: config.endpoint,
            buildFormData: (file: File, params: TParams) => (config.buildFormData as (params: TParams, file: File) => FormData)(params, file),
            filePrefix: config.filePrefix,
            responseHandler: config.responseHandler,
            timeout: config.timeout
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
        
        // Add to file context
        await addFiles(processedFiles);
        
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
  }, [t, config, actions, recordOperation, markOperationApplied, markOperationFailed, addFiles, processFiles, generateThumbnails, createDownloadInfo, cleanupBlobUrls]);

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