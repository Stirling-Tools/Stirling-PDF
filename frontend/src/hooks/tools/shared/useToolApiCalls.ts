import { useCallback, useRef } from 'react';
import axios, { CancelTokenSource } from 'axios';
import { processResponse } from '../../../utils/toolResponseProcessor';
import type { ResponseHandler, ProcessingProgress } from './useToolState';

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | ((params: TParams) => string);
  buildFormData: (file: File, params: TParams) => FormData;
  filePrefix: string;
  responseHandler?: ResponseHandler;
}

export const useToolApiCalls = <TParams = void>() => {
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  const processFiles = useCallback(async (
    params: TParams,
    validFiles: File[],
    config: ApiCallsConfig<TParams>,
    onProgress: (progress: ProcessingProgress) => void,
    onStatus: (status: string) => void
  ): Promise<File[]> => {
    const processedFiles: File[] = [];
    const failedFiles: { file: string; error: string }[] = [];
    const total = validFiles.length;

    // Create cancel token for this operation
    cancelTokenRef.current = axios.CancelToken.source();

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      onProgress({ current: i + 1, total, currentFileName: file.name });
      onStatus(`Processing ${file.name} (${i + 1}/${total})`);

      try {
        const formData = config.buildFormData(file, params);
        const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
        const response = await axios.post(endpoint, formData, {
          responseType: 'blob',
          cancelToken: cancelTokenRef.current.token,
        });

        // Forward to shared response processor (uses tool-specific responseHandler if provided)
        const responseFiles = await processResponse(
          response.data,
          [file],
          config.filePrefix,
          config.responseHandler
        );
        processedFiles.push(...responseFiles);

      } catch (error) {
        if (axios.isCancel(error)) {
          throw new Error('Operation was cancelled');
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to process ${file.name}:`, errorMessage);
        failedFiles.push({ file: file.name, error: errorMessage });
      }
    }

    if (failedFiles.length > 0 && processedFiles.length === 0) {
      // All files failed - provide detailed error information
      const errorDetails = failedFiles.map(f => `${f.file}: ${f.error}`).join('; ');
      throw new Error(`Failed to process all files: ${errorDetails}`);
    }

    if (failedFiles.length > 0) {
      // Some files failed - provide detailed status with errors
      const failedNames = failedFiles.map(f => `${f.file} (${f.error})`).join(', ');
      onStatus(`Processed ${processedFiles.length}/${total} files. Failed: ${failedNames}`);
    } else {
      onStatus(`Successfully processed ${processedFiles.length} file${processedFiles.length === 1 ? '' : 's'}`);
    }

    return processedFiles;
  }, []);

  const cancelOperation = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Operation cancelled by user');
      cancelTokenRef.current = null;
    }
  }, []);

  return {
    processFiles,
    cancelOperation,
  };
};
