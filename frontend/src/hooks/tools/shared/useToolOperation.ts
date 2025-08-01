import { useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { zipFileService } from '../../../services/zipFileService';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';

/**
 * Configuration interface for tool operations that defines how files should be processed.
 * @template TParams - Type of parameters required by the tool (use void for no parameters)
 */
export interface ToolOperationConfig<TParams = void> {
  /** Unique identifier for the operation type (e.g., 'compress', 'repair') */
  operationType: string;
  /** Backend API endpoint for the operation */
  endpoint: string;
  /** Function to build FormData from file and parameters for API submission */
  buildFormData: (file: File, params: TParams) => FormData;
  /** Optional custom response processor for operations returning multiple files */
  processResponse?: (blob: Blob) => Promise<File[]>;
  /** Prefix added to processed file names (e.g., 'compressed_', 'repaired_') */
  filePrefix: string;
  /** If true, processes single files directly; if false, processes files individually */
  singleFileMode?: boolean;
}

/**
 * State interface for tool operations containing all operation results and UI state.
 */
export interface ToolOperationState {
  /** Array of processed files returned by the operation */
  files: File[];
  /** Array of thumbnail URLs corresponding to processed files */
  thumbnails: string[];
  /** Whether thumbnails are currently being generated */
  isGeneratingThumbnails: boolean;
  /** Blob URL for downloading results (single file or zip) */
  downloadUrl: string | null;
  /** Suggested filename for download */
  downloadFilename: string;
  /** Whether the operation is currently in progress */
  isLoading: boolean;
  /** Current operation status message for user feedback */
  status: string;
  /** Error message if operation failed, null if no error */
  errorMessage: string | null;
  /** Function to reset all operation results and state */
  resetResults: () => void;
  /** Function to clear current error message */
  clearError: () => void;
}

/**
 * Complete hook interface for tool operations, extending state with execution capability.
 * @template TParams - Type of parameters required by the tool
 */
export interface ToolOperationHook<TParams = void> extends ToolOperationState {
  /** Function to execute the tool operation with given parameters and files */
  executeOperation: (params: TParams, selectedFiles: File[]) => Promise<void>;
}

/**
 * Shared hook for implementing tool operations with consistent behavior across all tools.
 * Handles file processing, thumbnail generation, download URLs, error handling, and FileContext integration.
 * 
 * @template TParams - Type of parameters required by the tool (use void for no parameters)
 * @param config - Configuration object defining how the tool should process files
 * @returns Hook with state and execution function for the tool operation
 */
export const useToolOperation = <TParams = void>(
  config: ToolOperationConfig<TParams>
): ToolOperationHook<TParams> => {
  const { t } = useTranslation();
  const {
    recordOperation,
    markOperationApplied,
    markOperationFailed,
    addFiles
  } = useFileContext();

  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track blob URLs for cleanup
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const cleanupBlobUrls = useCallback(() => {
    blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error);
      }
    });
    setBlobUrls([]);
  }, [blobUrls]);

  const createOperation = useCallback((
    params: TParams,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `${config.operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles.map(f => f.name).join(',');

    const operation: FileOperation = {
      id: operationId,
      type: config.operationType,
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0]?.name,
        outputFileNames: selectedFiles.map(f => f.name),
        parameters: params,
        fileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
      }
    };

    return { operation, operationId, fileId };
  }, [config.operationType]);

  const processMultipleFiles = useCallback(async (
    params: TParams,
    validFiles: File[]
  ): Promise<File[]> => {
    const processedFiles: File[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setStatus(`Processing ${file.name} (${i + 1}/${validFiles.length})`);

      try {
        const formData = config.buildFormData(file, params);
        const response = await axios.post(config.endpoint, formData, { 
          responseType: 'blob' 
        });

        const contentType = response.headers['content-type'] || 'application/pdf';
        const blob = new Blob([response.data], { type: contentType });
        const processedFile = new File([blob], `${config.filePrefix}${file.name}`, { type: contentType });

        processedFiles.push(processedFile);
      } catch (fileError) {
        console.error(`Failed to process ${file.name}:`, fileError);
        failedFiles.push(file.name);
      }
    }

    if (failedFiles.length > 0 && processedFiles.length === 0) {
      throw new Error(`Failed to process all files: ${failedFiles.join(', ')}`);
    }

    if (failedFiles.length > 0) {
      setStatus(`Processed ${processedFiles.length}/${validFiles.length} files. Failed: ${failedFiles.join(', ')}`);
    }

    return processedFiles;
  }, [config]);

  const handleDownloadAndThumbnails = useCallback(async (
    processedFiles: File[],
    originalFiles: File[]
  ) => {
    setFiles(processedFiles);
    setIsGeneratingThumbnails(true);

    await addFiles(processedFiles);
    cleanupBlobUrls();

    if (processedFiles.length === 1) {
      const url = window.URL.createObjectURL(processedFiles[0]);
      setDownloadUrl(url);
      setBlobUrls([url]);
      setDownloadFilename(`${config.filePrefix}${originalFiles[0].name}`);
    } else {
      const zipFilename = `${config.filePrefix}${processedFiles.length}_files.zip`;
      const { zipFile } = await zipFileService.createZipFromFiles(processedFiles, zipFilename);
      const url = window.URL.createObjectURL(zipFile);
      setDownloadUrl(url);
      setBlobUrls([url]);
      setDownloadFilename(zipFilename);
    }

    const thumbnails = await Promise.all(
      processedFiles.map(async (file) => {
        try {
          const thumbnail = await generateThumbnailForFile(file);
          return thumbnail || '';
        } catch (error) {
          console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
          return '';
        }
      })
    );

    setThumbnails(thumbnails);
    setIsGeneratingThumbnails(false);
  }, [config.filePrefix, addFiles, cleanupBlobUrls]);

  const executeOperation = useCallback(async (params: TParams, selectedFiles: File[]) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }

    const validFiles = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      setErrorMessage('No valid files to process. All selected files are empty.');
      return;
    }

    if (validFiles.length < selectedFiles.length) {
      console.warn(`Skipping ${selectedFiles.length - validFiles.length} empty files`);
    }

    const { operation, operationId, fileId } = createOperation(params, selectedFiles);
    recordOperation(fileId, operation);

    setIsLoading(true);
    setErrorMessage(null);
    setFiles([]);
    setThumbnails([]);
    setStatus(t("loading"));

    try {
      let processedFiles: File[];

      if (config.singleFileMode && validFiles.length === 1) {
        // Single file mode - direct API call
        const formData = config.buildFormData(validFiles[0], params);
        const response = await axios.post(config.endpoint, formData, { responseType: 'blob' });
        
        if (config.processResponse) {
          processedFiles = await config.processResponse(response.data);
        } else {
          const contentType = response.headers['content-type'] || 'application/pdf';
          const blob = new Blob([response.data], { type: contentType });
          const processedFile = new File([blob], `${config.filePrefix}${validFiles[0].name}`, { type: contentType });
          processedFiles = [processedFile];
        }
      } else {
        // Multi-file mode - process each file individually
        processedFiles = await processMultipleFiles(params, validFiles);
      }

      await handleDownloadAndThumbnails(processedFiles, selectedFiles);
      
      setStatus(t("downloadComplete"));
      markOperationApplied(fileId, operationId);
    } catch (error: any) {
      console.error(error);
      let errorMsg = `An error occurred while processing the ${config.operationType} operation.`;
      if (error.response?.data && typeof error.response.data === 'string') {
        errorMsg = error.response.data;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
      setStatus(`${config.operationType} failed.`);
      markOperationFailed(fileId, operationId, errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [t, config, createOperation, recordOperation, markOperationApplied, markOperationFailed, processMultipleFiles, handleDownloadAndThumbnails]);

  const resetResults = useCallback(() => {
    cleanupBlobUrls();
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, [cleanupBlobUrls]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    files,
    thumbnails,
    isGeneratingThumbnails,
    downloadUrl,
    downloadFilename,
    isLoading,
    status,
    errorMessage,
    executeOperation,
    resetResults,
    clearError
  };
};