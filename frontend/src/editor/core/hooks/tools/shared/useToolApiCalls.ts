import { useCallback, useRef } from "react";
import axios, { type CancelTokenSource } from "axios"; // Real axios for static methods (CancelToken, isCancel)
import apiClient from "@editor/services/apiClient"; // Our configured instance
import {
  processResponse,
  ResponseHandler,
} from "@editor/utils/toolResponseProcessor";
import { isEmptyOutput } from "@editor/services/errorUtils";
import type { ProcessingProgress } from "@editor/hooks/tools/shared/useToolState";
import type { StirlingFile, FileId } from "@editor/types/fileContext";
import { isSignupRequiredError } from "@editor/utils/toolErrorHandler";
import { combineAbortSignals } from "@editor/utils/combineAbortSignals";
import {
  prepareUnlockedFile,
  protectUnlockedResults,
  changePdfSecurity,
} from "@editor/services/pdfSessionUnlock";
import {
  inspectLocalPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  pdfAccessLifetime,
  pdfAccessSessionLifetime,
} from "@editor/services/pdfAccessService";

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

      const cancellation = axios.CancelToken.source();
      cancelTokenRef.current = cancellation;
      const operationCancellation = cancellation.token.toAbortSignal();
      const sessionLifetime = pdfAccessSessionLifetime();
      const sourceLifetimes = validFiles.map(pdfAccessLifetime);
      const outputsBySource = new Map<FileId, File[]>();

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

        const sourceLifetime = sourceLifetimes[i];
        const { signal: fileSignal, dispose } = combineAbortSignals([
          operationCancellation,
          sourceLifetime,
        ]);
        try {
          cancellation.token.throwIfRequested();
          sourceLifetime.throwIfAborted();
          const workingFile = await prepareUnlockedFile(
            file,
            endpoint,
            fileSignal,
            cancellation.token,
          );
          const formData = config.buildFormData(params, workingFile);
          console.debug("[processFiles] POST", { endpoint, name: file.name });
          const response =
            endpoint === "/api/v1/security/add-password" ||
            endpoint === "/api/v1/security/remove-password"
              ? {
                  data: await changePdfSecurity(
                    file,
                    formData,
                    endpoint,
                    cancellation.token,
                  ),
                  status: 200,
                  headers: undefined,
                }
              : await apiClient.post(endpoint, formData, {
                  responseType: "blob",
                  cancelToken: cancellation.token,
                  signal: sourceLifetime,
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
          if (
            endpoint === "/api/v1/security/add-password" ||
            endpoint === "/api/v1/security/remove-password"
          ) {
            const password =
              endpoint === "/api/v1/security/remove-password"
                ? formData.get("password")
                  ? ""
                  : String(formData.get("retainedOpeningPassword") ?? "")
                : formData.has("keyLength")
                  ? String(formData.get("password") ?? "")
                  : (getPdfAccess(file)?.openingPassword ??
                    String(
                      formData.get("ownerPassword") ||
                        getPdfAccess(file)?.password ||
                        "",
                    ));
            for (const output of responseFiles) {
              const access = await inspectLocalPdfAccess(
                output,
                password,
                fileSignal,
              );
              cancellation.token.throwIfRequested();
              if (fileSignal.aborted)
                throw new axios.CanceledError("Operation cancelled");
              rememberPdfAccess(output, access);
            }
          }
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
          sourceLifetime.throwIfAborted();
          const protectedFiles = await protectUnlockedResults(
            responseFiles,
            [file],
            endpoint,
          );
          cancellation.token.throwIfRequested();
          sourceLifetime.throwIfAborted();
          processedFiles.push(...protectedFiles);
          outputsBySource.set(file.fileId, protectedFiles);
          // record source id as successful
          successSourceIds.push(file.fileId);
          console.debug("[processFiles] Success", {
            name: file.name,
            produced: responseFiles.length,
          });
        } catch (error) {
          if (cancellation.token.reason || sessionLifetime.aborted) {
            throw new Error("Operation was cancelled", { cause: error });
          }
          if (sourceLifetime.aborted) {
            unprocessedSourceIds.push(file.fileId);
            continue;
          }
          if (isSignupRequiredError(error)) {
            if (processedFiles.length === 0) throw error;
            unprocessedSourceIds.push(
              ...validFiles.slice(i).map((input) => input.fileId),
            );
            break;
          }
          if (
            axios.isCancel(error) ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            throw new Error("Operation was cancelled", { cause: error });
          }
          console.error("[processFiles] Failed", { name: file.name, error });
          failedFiles.push(file.name);
          failedInputs.push({ fileId: file.fileId, name: file.name, error });
          // mark errored file so UI can highlight
          try {
            markFileError?.(file.fileId);
          } catch (e) {
            console.debug("markFileError", e);
          }
        } finally {
          dispose();
        }
      }

      // A completed source may be closed while another request is still running.
      for (let i = 0; i < validFiles.length; i++) {
        const id = validFiles[i].fileId;
        if (!sourceLifetimes[i].aborted || !outputsBySource.has(id)) continue;
        const outputs = new Set(outputsBySource.get(id));
        for (let j = processedFiles.length - 1; j >= 0; j--)
          if (outputs.has(processedFiles[j])) processedFiles.splice(j, 1);
        successSourceIds.splice(successSourceIds.indexOf(id), 1);
        unprocessedSourceIds.push(id);
      }

      if (failedFiles.length > 0 && processedFiles.length === 0) {
        if (failedInputs.length === 1) throw failedInputs[0].error;
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
