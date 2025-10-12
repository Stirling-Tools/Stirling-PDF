import { useCallback, useRef } from 'react';
import axios, { type CancelTokenSource } from 'axios'; // Real axios for static methods (CancelToken, isCancel)
import apiClient from '../../../services/apiClient'; // Our configured instance
import { processResponse, ResponseHandler } from '../../../utils/toolResponseProcessor';
import { isEmptyOutput } from '../../../services/errorUtils';
import {
  ensureAsyncParam,
  waitForJobCompletion,
  fetchJobResult,
  downloadResultFile,
  readJobResponseBlob,
} from '../../../services/jobService';
import type { JobStatus } from '../../../services/jobService';
import type { ProcessingProgress } from './useToolState';
import type { FileId } from '../../../types/file';
import type { FileJobStatus } from '../../../types/fileContext';

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | ((params: TParams) => string);
  buildFormData: (params: TParams, file: File) => FormData;
  filePrefix?: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
}

export interface BatchApiCallsConfig<TParams = void> extends Omit<ApiCallsConfig<TParams>, 'buildFormData'> {
  buildFormData: (params: TParams, files: File[]) => FormData;
}

export interface JobUpdate {
  jobId: string;
  status: FileJobStatus;
  progressPercent: number;
  message?: string;
  queuePosition?: number | null;
  error?: string;
}

type JobUpdateCallback = (fileIds: FileId[], update: JobUpdate) => void;

type BuildStatus = (status: JobStatus) => JobUpdate;

interface RunToolJobOptions<TParams> {
  params: TParams;
  endpoint: string;
  formData: FormData;
  originalFiles: File[];
  filePrefix?: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
  onStatus: (status: string) => void;
  onJobUpdate?: JobUpdateCallback;
  buildStatus: BuildStatus;
  isCancelled: () => boolean;
  cancelToken?: CancelTokenSource | null;
}

const DEFAULT_PROGRESS_FALLBACK = 10;

function getFileIds(files: File[]): FileId[] {
  return files
    .map(file => (file as any)?.fileId)
    .filter((id): id is FileId => typeof id === 'string' && id.length > 0);
}

export const useToolApiCalls = <TParams = void>() => {
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);
  const isCancelledRef = useRef(false);

  const jobStatusToUpdate = useCallback<BuildStatus>((status) => {
    const hasError = Boolean(status.error);
    const isComplete = status.complete && !hasError;
    let derivedStatus: FileJobStatus = 'processing';

    if (hasError) {
      derivedStatus = 'failed';
    } else if (status.inQueue && !status.complete) {
      derivedStatus = 'queued';
    } else if (isComplete) {
      derivedStatus = 'completed';
    }

    const queueMessage = (() => {
      if (!status.inQueue) return undefined;
      if (typeof status.queuePosition === 'number' && status.queuePosition >= 0) {
        return `Queued (#${status.queuePosition + 1})`;
      }
      return 'Queued';
    })();

    const message =
      status.error ??
      status.progressMessage ??
      (isComplete ? 'Completed' : queueMessage);

    const progress = typeof status.progressPercent === 'number'
      ? status.progressPercent
      : derivedStatus === 'completed'
        ? 100
        : derivedStatus === 'queued'
          ? 0
          : DEFAULT_PROGRESS_FALLBACK;

    return {
      jobId: status.jobId,
      status: derivedStatus,
      progressPercent: Math.max(0, Math.min(progress, 100)),
      message,
      queuePosition: typeof status.queuePosition === 'number' ? status.queuePosition : null,
      error: status.error ?? undefined,
    };
  }, []);

  const runToolJob = useCallback(async <T>(options: RunToolJobOptions<T>): Promise<File[]> => {
    const {
      endpoint,
      formData,
      originalFiles,
      filePrefix,
      responseHandler,
      preserveBackendFilename,
      onStatus,
      onJobUpdate,
      buildStatus,
      isCancelled,
      cancelToken,
    } = options;

    const asyncEndpoint = ensureAsyncParam(endpoint);
    const token = cancelToken?.token;
    const response = await apiClient.post(asyncEndpoint, formData, {
      responseType: 'blob',
      cancelToken: token,
    });

    const headers = response.headers ?? {};
    const contentType = (headers['content-type'] || '') as string;

    if (contentType.includes('application/json')) {
      const payload = await readJobResponseBlob(response.data);

      if (payload && typeof payload === 'object' && payload.async && payload.jobId) {
        const fileIds = getFileIds(originalFiles);
        const initialUpdate: JobUpdate = {
          jobId: payload.jobId,
          status: 'queued',
          progressPercent: 0,
          message: 'Job submitted',
          queuePosition: null,
        };
        onJobUpdate?.(fileIds, initialUpdate);
        onStatus(initialUpdate.message ?? 'Job submitted');

        const finalStatus = await waitForJobCompletion(payload.jobId, {
          cancelToken: token,
          isCancelled,
          onUpdate: (status) => {
            const update = buildStatus(status);
            onJobUpdate?.(fileIds, update);
            if (update.message) {
              onStatus(update.message);
            }
          },
        });

        const completionUpdate = buildStatus(finalStatus);

        if (completionUpdate.status === 'failed') {
          onJobUpdate?.(fileIds, completionUpdate);
          if (completionUpdate.message) {
            onStatus(completionUpdate.message);
          }
          throw new Error(completionUpdate.error || 'Job failed');
        }

        const downloadUpdate: JobUpdate = {
          jobId: completionUpdate.jobId,
          status: 'processing',
          progressPercent: Math.max(
            96,
            completionUpdate.progressPercent
              ? Math.min(completionUpdate.progressPercent, 98)
              : 96,
          ),
          message: 'Downloading results...',
          queuePosition: null,
        };
        onJobUpdate?.(fileIds, downloadUpdate);
        onStatus(downloadUpdate.message);

        const jobResult = await fetchJobResult(payload.jobId, token);

        const prepareUpdate: JobUpdate = {
          jobId: completionUpdate.jobId,
          status: 'processing',
          progressPercent: Math.max(downloadUpdate.progressPercent, 98),
          message: 'Preparing files...',
          queuePosition: null,
        };

        let processedFiles: File[];

        if (jobResult.type === 'blob') {
          processedFiles = await processResponse(
            jobResult.blob,
            originalFiles,
            filePrefix,
            responseHandler,
            preserveBackendFilename ? jobResult.headers : undefined,
          );
        } else if (jobResult.type === 'multipleFiles') {
          processedFiles = await Promise.all(
            jobResult.files.map(meta => downloadResultFile(meta, token))
          );
        } else {
          throw new Error('Unsupported async job result format');
        }

        onJobUpdate?.(fileIds, prepareUpdate);
        if (prepareUpdate.message) {
          onStatus(prepareUpdate.message);
        }

        const finalNormalizedUpdate = {
          ...completionUpdate,
          progressPercent: 100,
          message: completionUpdate.message ?? 'Completed',
        };
        onJobUpdate?.(fileIds, finalNormalizedUpdate);
        if (finalNormalizedUpdate.message) {
          onStatus(finalNormalizedUpdate.message);
        }

        return processedFiles;
      }

      if (payload && typeof payload === 'object' && payload.error) {
        throw new Error(payload.error);
      }

      throw new Error('Async job response missing jobId');
    }

    // Fallback: backend returned immediate blob (synchronous)
    return processResponse(
      response.data,
      originalFiles,
      filePrefix,
      responseHandler,
      preserveBackendFilename ? headers : undefined,
    );
  }, []);

  const processFiles = useCallback(async (
    params: TParams,
    validFiles: File[],
    config: ApiCallsConfig<TParams>,
    onProgress: (progress: ProcessingProgress) => void,
    onStatus: (status: string) => void,
    markFileError?: (fileId: string) => void,
    onJobUpdate?: JobUpdateCallback,
  ): Promise<{ outputFiles: File[]; successSourceIds: string[] }> => {
    const processedFiles: File[] = [];
    const successSourceIds: string[] = [];
    const failedFiles: string[] = [];
    const total = validFiles.length;

    isCancelledRef.current = false;
    cancelTokenRef.current = axios.CancelToken.source();

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        onProgress({ current: i + 1, total, currentFileName: file.name });
        onStatus(`Processing ${file.name} (${i + 1}/${total})`);

        try {
          const formData = config.buildFormData(params, file);
          const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;

          const responseFiles = await runToolJob({
            params,
            endpoint,
            formData,
            originalFiles: [file],
            filePrefix: config.filePrefix,
            responseHandler: config.responseHandler,
            preserveBackendFilename: config.preserveBackendFilename,
            onStatus,
            onJobUpdate,
            buildStatus: jobStatusToUpdate,
            isCancelled: () => isCancelledRef.current,
            cancelToken: cancelTokenRef.current,
          });

          const empty = isEmptyOutput(responseFiles);
          if (empty) {
            failedFiles.push(file.name);
            markFileError?.((file as any).fileId);
            continue;
          }

          processedFiles.push(...responseFiles);
          successSourceIds.push((file as any).fileId);
        } catch (error) {
          if (axios.isCancel(error) || (error as Error)?.message === 'Operation was cancelled') {
            throw new Error('Operation was cancelled');
          }

          failedFiles.push(file.name);
          markFileError?.((file as any).fileId);
          console.error('[processFiles] Job failed', { name: file.name, error });
        }
      }
    } finally {
      cancelTokenRef.current = null;
    }

    if (failedFiles.length > 0 && processedFiles.length === 0) {
      throw new Error(`Failed to process all files: ${failedFiles.join(', ')}`);
    }

    if (failedFiles.length > 0) {
      onStatus(`Processed ${processedFiles.length}/${total} files. Failed: ${failedFiles.join(', ')}`);
    } else {
      onStatus(`Successfully processed ${processedFiles.length} file${processedFiles.length === 1 ? '' : 's'}`);
    }

    return { outputFiles: processedFiles, successSourceIds };
  }, [jobStatusToUpdate, runToolJob]);

  const processBatchJob = useCallback(async (
    params: TParams,
    files: File[],
    config: BatchApiCallsConfig<TParams>,
    onProgress: (progress: ProcessingProgress) => void,
    onStatus: (status: string) => void,
    onJobUpdate?: JobUpdateCallback,
  ): Promise<{ outputFiles: File[]; successSourceIds: string[] }> => {
    isCancelledRef.current = false;
    cancelTokenRef.current = axios.CancelToken.source();

    try {
      onStatus('Processing files...');
      onProgress({ current: 0, total: files.length, currentFileName: files[0]?.name });

      const endpoint = typeof config.endpoint === 'function' ? config.endpoint(params) : config.endpoint;
      const formData = config.buildFormData(params, files);

      const responseFiles = await runToolJob({
        params,
        endpoint,
        formData,
        originalFiles: files,
        filePrefix: config.filePrefix,
        responseHandler: config.responseHandler,
        preserveBackendFilename: config.preserveBackendFilename,
        onStatus,
        onJobUpdate,
        buildStatus: jobStatusToUpdate,
        isCancelled: () => isCancelledRef.current,
        cancelToken: cancelTokenRef.current,
      });

      const empty = isEmptyOutput(responseFiles);
      if (empty) {
        throw new Error('No files produced by operation');
      }

      onProgress({ current: files.length, total: files.length, currentFileName: files[files.length - 1]?.name });
      onStatus(`Successfully processed ${responseFiles.length} file${responseFiles.length === 1 ? '' : 's'}`);

      const successIds = getFileIds(files).map(id => id as unknown as string);
      return { outputFiles: responseFiles, successSourceIds: successIds };
    } finally {
      cancelTokenRef.current = null;
    }
  }, [jobStatusToUpdate, runToolJob]);

  const cancelOperation = useCallback(() => {
    isCancelledRef.current = true;
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Operation cancelled by user');
      cancelTokenRef.current = null;
    }
  }, []);

  return {
    processFiles,
    processBatchJob,
    cancelOperation,
  };
};
