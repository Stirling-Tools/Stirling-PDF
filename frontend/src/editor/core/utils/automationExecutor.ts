import apiClient from "@editor/services/apiClient";
import { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolId } from "@editor/types/toolId";
import { AUTOMATION_CONSTANTS } from "@editor/constants/automation";
import { AutomationFileProcessor } from "@editor/utils/automationFileProcessor";
import { ToolType } from "@editor/hooks/tools/shared/useToolOperation";
import {
  type ErasedToolParams,
  type MultiFileToolOperationConfig,
  type SingleFileToolOperationConfig,
} from "@editor/hooks/tools/shared/toolOperationTypes";
import { zipFileService } from "@editor/services/zipFileService";
import { processResponse } from "@editor/utils/toolResponseProcessor";
import { resolveToolErrorMessage } from "@editor/utils/toolErrorHandler";
import { serverErrorReason } from "@editor/services/errorUtils";
import { type AutomationConfig } from "@editor/types/automation";
import { assertSignedPdfsEditable } from "@editor/services/pdfSessionUnlock";

export const processMultiFileResponse = async (
  responseData: Blob,
  responseHeaders: Record<string, unknown>,
  files: File[],
  filePrefix: string,
  preserveBackendFilename?: boolean,
): Promise<File[]> => {
  const contentTypeHeader = responseHeaders?.["content-type"];
  const looksLikeZip = await zipFileService.isZipResponse(
    responseData,
    typeof contentTypeHeader === "string" ? contentTypeHeader : undefined,
  );

  if (!looksLikeZip) {
    return processResponse(
      responseData,
      files,
      filePrefix,
      undefined,
      preserveBackendFilename ? responseHeaders : undefined,
    );
  }

  const result =
    await AutomationFileProcessor.extractAutomationZipFiles(responseData);

  if (result.errors.length > 0) {
    console.warn(`⚠️ File processing warnings:`, result.errors);
  }

  if (!filePrefix || preserveBackendFilename) {
    return result.files;
  }
  return result.files.map(
    (file) =>
      new File([file], `${filePrefix}${file.name}`, { type: file.type }),
  );
};

/**
 * Core execution function for API requests
 */
const executeApiRequest = async (
  endpoint: string,
  formData: FormData,
  files: File[],
  filePrefix: string,
  preserveBackendFilename?: boolean,
  signal?: AbortSignal,
): Promise<File[]> => {
  const response = await apiClient.post(endpoint, formData, {
    responseType: "blob",
    signal,
  });

  return await processMultiFileResponse(
    response.data,
    response.headers,
    files,
    filePrefix,
    preserveBackendFilename,
  );
};

/**
 * Execute single-file tool operation (processes files one at a time)
 */
const executeSingleFileOperation = async (
  config: SingleFileToolOperationConfig<ErasedToolParams>,
  parameters: ErasedToolParams,
  files: File[],
  filePrefix: string,
  signal?: AbortSignal,
): Promise<File[]> => {
  const resultFiles: File[] = [];

  const endpoint =
    typeof config.endpoint === "function"
      ? config.endpoint(parameters)
      : config.endpoint;
  if (!endpoint) {
    throw new Error(
      "This operation has no backend endpoint and cannot be executed directly.",
    );
  }

  for (const file of files) {
    signal?.throwIfAborted();
    const formData = config.buildFormData(parameters, file);

    const processedFiles = await executeApiRequest(
      endpoint,
      formData,
      [file],
      filePrefix,
      config.preserveBackendFilename,
      signal,
    );
    resultFiles.push(...processedFiles);
  }

  return resultFiles;
};

/**
 * Execute multi-file tool operation (processes all files in one request)
 */
const executeMultiFileOperation = async (
  config: MultiFileToolOperationConfig<ErasedToolParams>,
  parameters: ErasedToolParams,
  files: File[],
  filePrefix: string,
  signal?: AbortSignal,
): Promise<File[]> => {
  const endpoint =
    typeof config.endpoint === "function"
      ? config.endpoint(parameters)
      : config.endpoint;
  if (!endpoint) {
    throw new Error(
      "This operation has no backend endpoint and cannot be executed directly.",
    );
  }

  const formData = config.buildFormData(parameters, files);

  return await executeApiRequest(
    endpoint,
    formData,
    files,
    filePrefix,
    config.preserveBackendFilename,
    signal,
  );
};

/**
 * Execute a tool operation directly without using React hooks
 */
export const executeToolOperation = async (
  operationName: string,
  parameters: ErasedToolParams,
  files: File[],
  toolRegistry: ToolRegistry,
): Promise<File[]> => {
  return executeToolOperationWithPrefix(
    operationName,
    parameters,
    files,
    toolRegistry,
    AUTOMATION_CONSTANTS.FILE_PREFIX,
  );
};

/**
 * Execute a tool operation with custom prefix
 */
export const executeToolOperationWithPrefix = async (
  operationName: string,
  parameters: ErasedToolParams,
  files: File[],
  toolRegistry: ToolRegistry,
  filePrefix: string = AUTOMATION_CONSTANTS.FILE_PREFIX,
  signal?: AbortSignal,
): Promise<File[]> => {
  const config = toolRegistry[operationName as ToolId]?.operationConfig;
  if (!config) {
    throw new Error(`Tool operation not supported: ${operationName}`);
  }

  // Merge with default parameters to ensure all required fields are present
  const mergedParameters = { ...config.defaultParameters, ...parameters };
  const stepEndpoint =
    (typeof config.endpoint === "function"
      ? config.endpoint(mergedParameters)
      : config.endpoint) ?? undefined;
  await assertSignedPdfsEditable(
    files,
    stepEndpoint,
    !stepEndpoint && !!config.customProcessor,
  );

  try {
    // Check if tool uses custom processor (like Convert tool)
    if (config.customProcessor) {
      // Not passed `signal`: custom processors use their third argument for
      // their own options. The step boundary still honours it.
      const result = await config.customProcessor(mergedParameters, files);
      return result.files;
    }

    // Execute based on tool type
    if (config.toolType === ToolType.multiFile) {
      return await executeMultiFileOperation(
        config,
        mergedParameters,
        files,
        filePrefix,
        signal,
      );
    } else {
      return await executeSingleFileOperation(
        config,
        mergedParameters,
        files,
        filePrefix,
        signal,
      );
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error(`❌ ${operationName} failed:`, error);
    throw new Error(
      `${operationName} operation failed: ${await resolveToolErrorMessage(error)}`,
      {
        cause: error,
      },
    );
  }
};

/**
 * What a failed step tells the user: the server's own reason when the response
 * carries one (the wrapped request error is the `cause`), else the error text.
 */
async function stepErrorMessage(error: unknown): Promise<string> {
  const cause = error instanceof Error ? error.cause : undefined;
  const reason =
    (await serverErrorReason(cause)) ?? (await serverErrorReason(error));
  if (reason) return reason;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Execute an entire automation sequence. Aborting `signal` stops it before the
 * next step and cancels the request in flight; it then rejects with the abort
 * reason and reports no step error, since nothing failed.
 */
export const executeAutomationSequence = async (
  automation: AutomationConfig,
  initialFiles: File[],
  toolRegistry: ToolRegistry,
  onStepStart?: (stepIndex: number, operationName: string) => void,
  onStepComplete?: (stepIndex: number, resultFiles: File[]) => void,
  onStepError?: (stepIndex: number, error: string) => void,
  signal?: AbortSignal,
): Promise<File[]> => {
  console.log(`🚀 Starting automation: ${automation.name || "Unnamed"}`);
  console.log(`📁 Input: ${initialFiles.length} file(s)`);

  if (!automation?.operations || automation.operations.length === 0) {
    throw new Error("No operations in automation");
  }

  let currentFiles = [...initialFiles];

  for (let i = 0; i < automation.operations.length; i++) {
    const operation = automation.operations[i];

    console.log(
      `\n📋 Step ${i + 1}/${automation.operations.length}: ${operation.operation}`,
    );
    console.log(`   Input: ${currentFiles.length} file(s)`);

    try {
      signal?.throwIfAborted();
      onStepStart?.(i, operation.operation);

      const resultFiles = await executeToolOperationWithPrefix(
        operation.operation,
        operation.parameters || {},
        currentFiles,
        toolRegistry,
        "",
        signal,
      );

      console.log(
        `✅ Step ${i + 1} completed: ${resultFiles.length} result files`,
      );
      currentFiles = resultFiles;
      onStepComplete?.(i, resultFiles);
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      console.error(`❌ Step ${i + 1} failed:`, error);
      onStepError?.(i, await stepErrorMessage(error));
      throw error;
    }
  }

  console.log(`\n🎉 Automation complete: ${currentFiles.length} file(s)`);
  return currentFiles;
};
