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
import {
  extractServerErrorReason,
  isPdfPasswordError,
  isSignupRequiredError,
} from "@app/utils/toolErrorHandler";
import {
  lockedDocumentRequest,
  rejectLockedDocumentPassword,
} from "@app/services/lockedDocumentAccess";
import type { LockedDocumentMode } from "@app/hooks/tools/shared/useLockedDocuments";

/** An input that did not survive the batch, with the error it failed on. */
export interface FailedInput {
  fileId: FileId;
  name: string;
  error: unknown;
}

export interface ApiCallsConfig<TParams = void> {
  endpoint: string | null | ((params: TParams) => string | null);
  buildFormData: (params: TParams, file: File) => FormData;
  filePrefix?: string;
  responseHandler?: ResponseHandler;
  preserveBackendFilename?: boolean;
  /** Send each file as its locked original with a `documentPassword`, when one is known. */
  lockedDocuments?: LockedDocumentMode;
}

/** The server's reason when every failure gave the same one, else undefined. */
async function sharedServerReason(
  failures: FailedInput[],
): Promise<string | undefined> {
  const reasons = await Promise.all(
    failures.map((failure) => extractServerErrorReason(failure.error)),
  );
  const distinct = new Set(reasons);
  return distinct.size === 1 ? reasons[0] : undefined;
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
    ): Promise<{
      outputFiles: File[];
      successSourceIds: FileId[];
      failedInputs: FailedInput[];
      unprocessedSourceIds: FileId[];
    }> => {
      const processedFiles: File[] = [];
      const successSourceIds: FileId[] = [];
      // Kept with their errors: a batch where only some inputs fail still owes the caller a
      // report for each one, and it cannot derive the kind without the error.
      const failedInputs: FailedInput[] = [];
      const unprocessedSourceIds: FileId[] = [];
      const failedFiles: string[] = [];
      const total = validFiles.length;

      // Create cancel token for this operation
      cancelTokenRef.current = axios.CancelToken.source();

      // Params are the same for every file, so resolve the endpoint once. A null
      // endpoint means the tool has no backend call (e.g. client-side tools) and
      // should never reach here, so fail loudly rather than POST to null.
      const endpoint =
        typeof config.endpoint === "function"
          ? config.endpoint(params)
          : config.endpoint;
      if (!endpoint) {
        throw new Error(
          "This operation has no backend endpoint and cannot be executed directly.",
        );
      }

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
          const request = config.lockedDocuments
            ? lockedDocumentRequest(file)
            : { file };
          const formData = config.buildFormData(params, request.file);
          if (request.documentPassword) {
            formData.append("documentPassword", request.documentPassword);
          }
          console.debug("[processFiles] POST", { endpoint, name: file.name });
          const response = await apiClient.post(endpoint, formData, {
            responseType: "blob",
            cancelToken: cancelTokenRef.current?.token,
          });
          console.debug("[processFiles] Response OK", {
            name: file.name,
            status: response.status,
          });

          // Forward to shared response processor (uses tool-specific responseHandler if provided)
          const responseFiles = await processResponse(
            response.data,
            [file],
            config.filePrefix,
            config.responseHandler,
            config.preserveBackendFilename ? response.headers : undefined,
          );
          // Guard: some endpoints may return an empty/0-byte file with 200
          const empty = isEmptyOutput(responseFiles);
          if (empty) {
            console.warn("[processFiles] Empty output treated as failure", {
              name: file.name,
            });
            failedFiles.push(file.name);
            failedInputs.push({
              fileId: file.fileId,
              name: file.name,
              error: new Error(`${endpoint} returned an empty output`),
            });
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
          if (isSignupRequiredError(error)) {
            if (processedFiles.length === 0) throw error;
            unprocessedSourceIds.push(
              ...validFiles.slice(i).map((input) => input.fileId),
            );
            break;
          }
          if (axios.isCancel(error)) {
            throw new Error("Operation was cancelled", { cause: error });
          }
          console.error("[processFiles] Failed", { name: file.name, error });
          if (config.lockedDocuments && (await isPdfPasswordError(error))) {
            rejectLockedDocumentPassword(file.fileId);
          }
          failedFiles.push(file.name);
          failedInputs.push({ fileId: file.fileId, name: file.name, error });
          // mark errored file so UI can highlight
          try {
            markFileError?.(file.fileId);
          } catch (e) {
            console.debug("markFileError", e);
          }
        }
      }

      if (failedFiles.length > 0 && processedFiles.length === 0) {
        // A blob response hides the server's reason (a wrong password, say), so read it back.
        const reason = config.lockedDocuments
          ? await sharedServerReason(failedInputs)
          : undefined;
        const names = failedFiles.join(", ");
        let message = `Failed to process all files: ${names}`;
        if (reason) message = total === 1 ? reason : `${reason} (${names})`;
        throw new Error(message);
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
      return {
        outputFiles: processedFiles,
        successSourceIds,
        failedInputs,
        unprocessedSourceIds,
      };
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
