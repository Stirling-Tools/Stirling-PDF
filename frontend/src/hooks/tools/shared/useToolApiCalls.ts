import { useCallback, useRef } from 'react';
import axios, { CancelTokenSource } from 'axios';
import { processResponse, ResponseHandler } from '../../../utils/toolResponseProcessor';
import type { ProcessingProgress } from './useToolState';

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | ((params: TParams) => string);
  buildFormData: (params: TParams, file: File) => FormData;
  filePrefix: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
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
    const failedFiles: string[] = [];
    const total = validFiles.length;

    // Create cancel token for this operation
    cancelTokenRef.current = axios.CancelToken.source();

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      onProgress({ current: i + 1, total, currentFileName: file.name });
      onStatus(`Processing ${file.name} (${i + 1}/${total})`);

      try {
        const formData = config.buildFormData(params, file);
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
          config.responseHandler,
          config.preserveBackendFilename ? response.headers : undefined
        );
        processedFiles.push(...responseFiles);

      } catch (error) {
        if (axios.isCancel(error)) {
          throw new Error('Operation was cancelled');
        }
        console.error(`Failed to process ${file.name}:`, error);
        failedFiles.push(file.name);
      }
    }

    if (failedFiles.length > 0 && processedFiles.length === 0) {
      throw new Error(`Failed to process all files: ${failedFiles.join(', ')}`);
    }

    if (failedFiles.length > 0) {
      onStatus(`Processed ${processedFiles.length}/${total} files. Failed: ${failedFiles.join(', ')}`);
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
