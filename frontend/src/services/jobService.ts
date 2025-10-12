import apiClient from './apiClient';
import type { CancelToken } from 'axios';
import { getFilenameFromHeaders } from '../utils/fileResponseUtils';

export interface JobStatus {
  jobId: string;
  complete: boolean;
  error?: string | null;
  progressPercent?: number | null;
  progressMessage?: string | null;
  inQueue?: boolean;
  queuePosition?: number | null;
  notes?: string[];
}

export interface JobResultFileMeta {
  fileId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export type JobResultData =
  | { type: 'blob'; blob: Blob; headers: Record<string, any> }
  | { type: 'multipleFiles'; files: JobResultFileMeta[] }
  | { type: 'json'; data: any };

type FetchStatusResponse = JobStatus & {
  [key: string]: any;
};

interface QueueInfo {
  inQueue?: boolean;
  position?: number;
}

export interface JobPollOptions {
  cancelToken?: CancelToken;
  intervalMs?: number;
  isCancelled?: () => boolean;
  onUpdate?: (status: JobStatus) => void;
}

const JOB_BASE_URL = '/api/v1/general/job';

export function ensureAsyncParam(endpoint: string): string {
  if (endpoint.includes('async=')) {
    return endpoint;
  }
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}async=true`;
}

function normalizeJobStatus(data: any, queueInfo?: QueueInfo): JobStatus {
  if (!data) {
    return {
      jobId: 'unknown',
      complete: false,
    };
  }

  const base: FetchStatusResponse = {
    jobId: data.jobId ?? data.jobID ?? data.id ?? 'unknown',
    complete: Boolean(data.complete),
    error: data.error ?? null,
    progressPercent: typeof data.progressPercent === 'number' ? data.progressPercent : undefined,
    progressMessage: data.progressMessage ?? undefined,
    notes: Array.isArray(data.notes) ? data.notes : undefined,
    inQueue: queueInfo?.inQueue,
    queuePosition: queueInfo?.position ?? null,
  };

  return base;
}

export async function fetchJobStatus(jobId: string, cancelToken?: CancelToken): Promise<JobStatus> {
  const response = await apiClient.get(`${JOB_BASE_URL}/${jobId}`, { cancelToken });
  const data = response.data;

  if (data && typeof data === 'object' && 'jobResult' in data) {
    const queue = data.queueInfo as QueueInfo | undefined;
    return normalizeJobStatus((data as any).jobResult, queue);
  }

  return normalizeJobStatus(data);
}

export async function waitForJobCompletion(jobId: string, options: JobPollOptions = {}): Promise<JobStatus> {
  const { intervalMs = 1000, onUpdate, isCancelled } = options;

  for (;;) {
    if (isCancelled?.()) {
      throw new Error('Operation was cancelled');
    }

    const status = await fetchJobStatus(jobId, options.cancelToken);
    onUpdate?.(status);

    if (status.complete) {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

export async function fetchJobResult(jobId: string, cancelToken?: CancelToken): Promise<JobResultData> {
  const response = await apiClient.get(`${JOB_BASE_URL}/${jobId}/result`, {
    responseType: 'blob',
    cancelToken,
  });

  const contentType = (response.headers?.['content-type'] || '') as string;

  if (contentType.includes('application/json')) {
    const text = await response.data.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      throw new Error('Failed to parse async job result JSON');
    }

    if (parsed?.hasMultipleFiles && Array.isArray(parsed.files)) {
      return { type: 'multipleFiles', files: parsed.files as JobResultFileMeta[] };
    }

    return { type: 'json', data: parsed };
  }

  return { type: 'blob', blob: response.data, headers: response.headers ?? {} };
}

export async function downloadResultFile(meta: JobResultFileMeta, cancelToken?: CancelToken): Promise<File> {
  const response = await apiClient.get(`/api/v1/general/files/${meta.fileId}`, {
    responseType: 'blob',
    cancelToken,
  });

  const blob = response.data as Blob;
  const type = blob.type || response.headers?.['content-type'] || meta.contentType || 'application/octet-stream';
  const filename = meta.fileName || getFilenameFromHeaders(response.headers?.['content-disposition']) || 'download';

  return new File([blob], filename, {
    type,
    lastModified: Date.now(),
  });
}

export async function readJobResponseBlob(blob: Blob): Promise<any> {
  const text = await blob.text();
  return JSON.parse(text);
}
