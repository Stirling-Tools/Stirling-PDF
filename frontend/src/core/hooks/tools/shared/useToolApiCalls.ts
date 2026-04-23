import { useCallback, useRef } from "react";
import axios, { type CancelTokenSource } from "axios"; // Real axios for static methods (CancelToken, isCancel)
import apiClient from "@app/services/apiClient"; // Our configured instance
import {
  processResponse,
  ResponseHandler,
} from "@app/utils/toolResponseProcessor";
import { isEmptyOutput } from "@app/services/errorUtils";
import type { ProcessingProgress } from "@app/hooks/tools/shared/useToolState";
import type { StirlingFile, FileId } from "@app/types/fileContext";

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | ((params: TParams) => string);
  buildFormData: (params: TParams, file: File) => FormData;
  filePrefix?: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
  /**
   * When true, POST with `?async=true`, then poll /api/v1/general/job/{jobId} until complete
   * and fetch the result blob. Surfaces backend progress (percent + message) to onProgress.
   */
  async?: boolean;
}

interface JobStatusPayload {
  complete?: boolean;
  error?: string | null;
  progress?: {
    percent?: number;
    message?: string | null;
    current?: number | null;
    total?: number | null;
  } | null;
  queueInfo?: {
    inQueue?: boolean;
    position?: number;
  } | null;
}

const POLL_INITIAL_MS = 150;
const POLL_MAX_MS = 500;
const POLL_BACKOFF = 1.2;

/**
 * Pull the job payload out of /job/{id}. The endpoint wraps with queue info when the job
 * is still queued ({ jobResult, queueInfo }) and returns the bare result otherwise — normalize
 * both shapes here so callers see one.
 */
function unwrapJobStatus(data: unknown): JobStatusPayload {
  if (data && typeof data === "object") {
    const maybe = data as {
      jobResult?: JobStatusPayload;
      queueInfo?: JobStatusPayload["queueInfo"];
    } & JobStatusPayload;
    // Queued jobs come wrapped as { jobResult, queueInfo }. Lift queueInfo so the
    // caller doesn't need to know about the wrapping.
    if (maybe.jobResult && typeof maybe.jobResult === "object") {
      return { ...maybe.jobResult, queueInfo: maybe.queueInfo ?? null };
    }
    return maybe;
  }
  return {};
}

/**
 * Submit a form to `endpoint?async=true`, then poll /job/{id} until complete, and finally
 * download the blob from /job/{id}/result. Re-usable by both single-file and multi-file paths.
 *
 * `index`/`total` are used purely for shaping the `ProcessingProgress` emitted to callers;
 * the backend job itself is scalar (one backend job per call).
 */
export async function submitAsyncJob(
  endpoint: string,
  formData: FormData,
  cancelToken: CancelTokenSource,
  onProgress: (progress: ProcessingProgress) => void,
  onStatus: (status: string) => void,
  opts: { index?: number; total?: number; currentFileName?: string } = {},
): Promise<{ data: Blob; headers: Record<string, any> }> {
  const asyncEndpoint = endpoint.includes("?")
    ? `${endpoint}&async=true`
    : `${endpoint}?async=true`;

  const submit = await apiClient.post(asyncEndpoint, formData, {
    responseType: "json",
    cancelToken: cancelToken.token,
  });
  const jobId: string | undefined = submit.data?.jobId;
  if (!jobId) {
    throw new Error("Server did not return a jobId for async job");
  }

  const index = opts.index ?? 0;
  const total = opts.total ?? 1;

  // Emit a 0% placeholder immediately so the bar renders on click, before the backend has
  // had a chance to report any real progress. Subsequent polls only overwrite with newer
  // values — a null progress on the wire (seen between stage boundaries) keeps what we
  // already have so the bar doesn't flicker.
  let lastPercent = 0;
  let lastMessage: string | undefined = "Starting…";
  onProgress({
    current: index + 1,
    total,
    currentFileName: opts.currentFileName,
    percent: lastPercent,
    message: lastMessage,
  });
  onStatus(lastMessage);

  let delay = POLL_INITIAL_MS;
  while (true) {
    if (cancelToken.token.reason) {
      // Best-effort server-side cancellation; ignore errors.
      try {
        await apiClient.delete(`/api/v1/general/job/${jobId}`);
      } catch {
        /* ignore */
      }
      throw new axios.Cancel("Operation cancelled by user");
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(POLL_MAX_MS, Math.floor(delay * POLL_BACKOFF));

    const statusResp = await apiClient.get(`/api/v1/general/job/${jobId}`, {
      cancelToken: cancelToken.token,
    });
    const status = unwrapJobStatus(statusResp.data);

    const progress = status.progress;
    const queueInfo = status.queueInfo;
    const queueMessage =
      queueInfo?.inQueue && typeof queueInfo.position === "number"
        ? `Waiting in queue (position ${queueInfo.position + 1})`
        : undefined;
    if (queueMessage !== undefined) {
      // While queued, reset the bar to 0 and show the queue position instead.
      lastPercent = 0;
      lastMessage = queueMessage;
    } else if (progress != null) {
      if (typeof progress.percent === "number") {
        lastPercent = progress.percent;
      }
      if (progress.message) {
        lastMessage = progress.message;
      }
    }
    onProgress({
      current: index + 1,
      total,
      currentFileName: opts.currentFileName,
      percent: lastPercent,
      message: lastMessage,
    });
    if (lastMessage) {
      onStatus(lastMessage);
    }

    if (status.complete) {
      if (status.error) {
        throw new Error(status.error);
      }
      break;
    }
  }

  const resultResp = await apiClient.get(
    `/api/v1/general/job/${jobId}/result`,
    {
      responseType: "blob",
      cancelToken: cancelToken.token,
    },
  );
  return { data: resultResp.data, headers: resultResp.headers };
}

async function processOneFileAsync<TParams>(
  params: TParams,
  file: StirlingFile,
  index: number,
  total: number,
  config: ApiCallsConfig<TParams>,
  cancelToken: CancelTokenSource,
  onProgress: (progress: ProcessingProgress) => void,
  onStatus: (status: string) => void,
): Promise<File[]> {
  const endpoint =
    typeof config.endpoint === "function"
      ? config.endpoint(params)
      : config.endpoint;
  const formData = config.buildFormData(params, file);
  const { data, headers } = await submitAsyncJob(
    endpoint,
    formData,
    cancelToken,
    onProgress,
    onStatus,
    { index, total, currentFileName: file.name },
  );
  return processResponse(
    data,
    [file],
    config.filePrefix,
    config.responseHandler,
    config.preserveBackendFilename ? headers : undefined,
  );
}

async function processOneFileSync<TParams>(
  params: TParams,
  file: StirlingFile,
  config: ApiCallsConfig<TParams>,
  cancelToken: CancelTokenSource,
): Promise<File[]> {
  const formData = config.buildFormData(params, file);
  const endpoint =
    typeof config.endpoint === "function"
      ? config.endpoint(params)
      : config.endpoint;
  const response = await apiClient.post(endpoint, formData, {
    responseType: "blob",
    cancelToken: cancelToken.token,
  });
  return processResponse(
    response.data,
    [file],
    config.filePrefix,
    config.responseHandler,
    config.preserveBackendFilename ? response.headers : undefined,
  );
}

export const useToolApiCalls = <TParams = void>() => {
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  const processFiles = useCallback(
    async (
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

        console.debug("[processFiles] Start", {
          index: i,
          total,
          name: file.name,
          fileId: file.fileId,
        });
        onProgress({ current: i + 1, total, currentFileName: file.name });
        onStatus(`Processing ${file.name} (${i + 1}/${total})`);

        try {
          const responseFiles = config.async
            ? await processOneFileAsync(
                params,
                file,
                i,
                total,
                config,
                cancelTokenRef.current,
                onProgress,
                onStatus,
              )
            : await processOneFileSync(
                params,
                file,
                config,
                cancelTokenRef.current,
              );
          // Guard: some endpoints may return an empty/0-byte file with 200
          const empty = isEmptyOutput(responseFiles);
          if (empty) {
            console.warn("[processFiles] Empty output treated as failure", {
              name: file.name,
            });
            failedFiles.push(file.name);
            try {
              markFileError?.(file.fileId);
            } catch (e) {
              console.debug("markFileError", e);
            }
            continue;
          }
          processedFiles.push(...responseFiles);
          // record source id as successful
          successSourceIds.push(file.fileId);
          console.debug("[processFiles] Success", {
            name: file.name,
            produced: responseFiles.length,
          });
        } catch (error) {
          if (axios.isCancel(error)) {
            throw new Error("Operation was cancelled", { cause: error });
          }
          console.error("[processFiles] Failed", { name: file.name, error });
          failedFiles.push(file.name);
          // mark errored file so UI can highlight
          try {
            markFileError?.(file.fileId);
          } catch (e) {
            console.debug("markFileError", e);
          }
        }
      }

      if (failedFiles.length > 0 && processedFiles.length === 0) {
        throw new Error(
          `Failed to process all files: ${failedFiles.join(", ")}`,
        );
      }

      if (failedFiles.length > 0) {
        onStatus(
          `Processed ${processedFiles.length}/${total} files. Failed: ${failedFiles.join(", ")}`,
        );
      } else {
        onStatus(
          `Successfully processed ${processedFiles.length} file${processedFiles.length === 1 ? "" : "s"}`,
        );
      }

      console.debug("[processFiles] Completed batch", {
        total,
        successes: successSourceIds.length,
        outputs: processedFiles.length,
        failed: failedFiles.length,
      });
      return { outputFiles: processedFiles, successSourceIds };
    },
    [],
  );

  const cancelOperation = useCallback(() => {
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel("Operation cancelled by user");
      cancelTokenRef.current = null;
    }
  }, []);

  return {
    processFiles,
    cancelOperation,
  };
};
