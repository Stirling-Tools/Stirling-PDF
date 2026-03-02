import { useCallback, useRef } from 'react';
import axios, {type CancelTokenSource} from 'axios'; // Real axios for static methods (CancelToken, isCancel)
import apiClient from '@app/services/apiClient'; // Our configured instance
import { processResponse, ResponseHandler } from '@app/utils/toolResponseProcessor';
import { isEmptyOutput } from '@app/services/errorUtils';
import type { ProcessingProgress } from '@app/hooks/tools/shared/useToolState';
import type { StirlingFile, FileId } from '@app/types/fileContext';

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | ((params: TParams) => string);
  buildFormData: (params: TParams, file: File) => FormData;
  filePrefix?: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
}

export const useToolApiCalls = <TParams = void>() => {
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  const processFiles = useCallback(async (
    params: TParams,
    validFiles: StirlingFile[],
    config: ApiCallsConfig<TParams>,
    onProgress: (progress: ProcessingProgress) => void,
    onStatus: (status: string) => void,
    markFileError?: (fileId: FileId) => void,
  ): Promise<{ outputFiles: File[]; successSourceIds: FileId[] }> => {
    const processedFiles: File[] = [];
    const successSourceIds: FileId[] = [];
    const failedFiles: string[] = [];
    const total = validFiles.length;

    // Create cancel token for this operation
    cancelTokenRef.current = axios.CancelToken.source();

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];

      console.debug('[processFiles] Start', { index: i, total, name: file.name, fileId: file.fileId });
      onProgress({ current: i + 1, total, currentFileName: file.name });
      onStatus(`Processing ${file.name} (${i + 1}/${total})`);

      try {
        const formData = config.buildFormData(params, file);
        const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
        console.debug('[processFiles] POST', { endpoint, name: file.name });
        const response = await apiClient.post(endpoint, formData, {
          responseType: 'blob',
          cancelToken: cancelTokenRef.current?.token,
        });
        console.debug('[processFiles] Response OK', { name: file.name, status: response.status });

        // Forward to shared response processor (uses tool-specific responseHandler if provided)
        const responseFiles = await processResponse(
          response.data,
          [file],
          config.filePrefix,
          config.responseHandler,
          config.preserveBackendFilename ? response.headers : undefined
        );
        // Guard: some endpoints may return an empty/0-byte file with 200
        const empty = isEmptyOutput(responseFiles);
        if (empty) {
          console.warn('[processFiles] Empty output treated as failure', { name: file.name });
          failedFiles.push(file.name);
          try {
            markFileError?.(file.fileId);
          } catch (e) {
            console.debug('markFileError', e);
          }
          continue;
        }
        processedFiles.push(...responseFiles);
        // record source id as successful
        successSourceIds.push(file.fileId);
        console.debug('[processFiles] Success', { name: file.name, produced: responseFiles.length });

      } catch (error) {
        if (axios.isCancel(error)) {
          throw new Error('Operation was cancelled', { cause: error });
        }
        console.error('[processFiles] Failed', { name: file.name, error });
        failedFiles.push(file.name);
        // mark errored file so UI can highlight
        try {
          markFileError?.(file.fileId);
        } catch (e) {
          console.debug('markFileError', e);
        }
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

    console.debug('[processFiles] Completed batch', { total, successes: successSourceIds.length, outputs: processedFiles.length, failed: failedFiles.length });
    return { outputFiles: processedFiles, successSourceIds };
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
