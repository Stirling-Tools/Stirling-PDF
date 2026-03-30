import apiClient from '@app/services/apiClient';
import { getSessionId } from '@app/hooks/useSSEConnection';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import { AUTOMATION_CONSTANTS } from '@app/constants/automation';
import { AutomationFileProcessor } from '@app/utils/automationFileProcessor';
import { ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { processResponse } from '@app/utils/toolResponseProcessor';
import { getFilenameFromHeaders } from '@app/utils/fileResponseUtils';

/**
 * Process multi-file tool response (handles ZIP or single PDF responses)
 */
const processMultiFileResponse = async (
  responseData: Blob,
  responseHeaders: any,
  files: File[],
  filePrefix: string,
  preserveBackendFilename?: boolean
): Promise<File[]> => {
  // Multi-file responses are typically ZIP files, but may be single files (e.g. split with merge=true)
  if (responseData.type === 'application/pdf' ||
      (responseHeaders && responseHeaders['content-type'] === 'application/pdf')) {
    // Single PDF response - use processResponse to respect preserveBackendFilename
    const processedFiles = await processResponse(
      responseData,
      files,
      filePrefix,
      undefined,
      preserveBackendFilename ? responseHeaders : undefined
    );
    return processedFiles;
  } else {
    // ZIP response
    const result = await AutomationFileProcessor.extractAutomationZipFiles(responseData);

    if (result.errors.length > 0) {
      console.warn(`⚠️ File processing warnings:`, result.errors);
    }

    // Apply prefix to files, replacing any existing prefix
    const processedFiles = filePrefix && !preserveBackendFilename
      ? result.files.map(file => {
          const nameWithoutPrefix = file.name.replace(/^[^_]*_/, '');
          return new File([file], `${filePrefix}${nameWithoutPrefix}`, { type: file.type });
        })
      : result.files;

    return processedFiles;
  }
};

/**
 * Core execution function for API requests
 */
const executeApiRequest = async (
  endpoint: string,
  formData: FormData,
  files: File[],
  filePrefix: string,
  preserveBackendFilename?: boolean
): Promise<File[]> => {
  const response = await apiClient.post(endpoint, formData, {
    responseType: 'blob',
    timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT
  });

  return await processMultiFileResponse(
    response.data,
    response.headers,
    files,
    filePrefix,
    preserveBackendFilename
  );
};

/**
 * Execute single-file tool operation (processes files one at a time)
 */
const executeSingleFileOperation = async (
  config: any,
  parameters: any,
  files: File[],
  filePrefix: string
): Promise<File[]> => {
  const resultFiles: File[] = [];

  for (const file of files) {
    const endpoint = typeof config.endpoint === 'function'
      ? config.endpoint(parameters)
      : config.endpoint;

    const formData = (config.buildFormData as (params: any, file: File) => FormData)(parameters, file);

    const processedFiles = await executeApiRequest(
      endpoint,
      formData,
      [file],
      filePrefix,
      config.preserveBackendFilename
    );
    resultFiles.push(...processedFiles);
  }

  return resultFiles;
};

/**
 * Execute multi-file tool operation (processes all files in one request)
 */
const executeMultiFileOperation = async (
  config: any,
  parameters: any,
  files: File[],
  filePrefix: string
): Promise<File[]> => {
  const endpoint = typeof config.endpoint === 'function'
    ? config.endpoint(parameters)
    : config.endpoint;

  const formData = (config.buildFormData as (params: any, files: File[]) => FormData)(parameters, files);

  return await executeApiRequest(
    endpoint,
    formData,
    files,
    filePrefix,
    config.preserveBackendFilename
  );
};


/**
 * Execute a tool operation directly without using React hooks
 */
export const executeToolOperation = async (
  operationName: string,
  parameters: any,
  files: File[],
  toolRegistry: Partial<ToolRegistry>
): Promise<File[]> => {
  return executeToolOperationWithPrefix(operationName, parameters, files, toolRegistry, AUTOMATION_CONSTANTS.FILE_PREFIX);
};

/**
 * Execute a tool operation with custom prefix
 */
export const executeToolOperationWithPrefix = async (
  operationName: string,
  parameters: any,
  files: File[],
  toolRegistry: Partial<ToolRegistry>,
  filePrefix: string = AUTOMATION_CONSTANTS.FILE_PREFIX
): Promise<File[]> => {
  const config = toolRegistry[operationName as ToolId]?.operationConfig;
  if (!config) {
    throw new Error(`Tool operation not supported: ${operationName}`);
  }

  // Merge with default parameters to ensure all required fields are present
  const mergedParameters = { ...config.defaultParameters, ...parameters };

  try {
    // Check if tool uses custom processor (like Convert tool)
    if (config.customProcessor) {
      const result = await config.customProcessor(mergedParameters, files);
      return result.files;
    }

    // Execute based on tool type
    if (config.toolType === ToolType.multiFile) {
      return await executeMultiFileOperation(config, mergedParameters, files, filePrefix);
    } else {
      return await executeSingleFileOperation(config, mergedParameters, files, filePrefix);
    }

  } catch (error: any) {
    console.error(`❌ ${operationName} failed:`, error);
    throw new Error(`${operationName} operation failed: ${error.response?.data || error.message}`, {
      cause: error,
    });
  }
};

/**
 * Execute an entire automation sequence
 */
export const executeAutomationSequence = async (
  automation: any,
  initialFiles: File[],
  toolRegistry: Partial<ToolRegistry>,
  onStepStart?: (stepIndex: number, operationName: string) => void,
  onStepComplete?: (stepIndex: number, resultFiles: File[]) => void,
  onStepError?: (stepIndex: number, error: string) => void
): Promise<File[]> => {
  console.log(`🚀 Starting automation: ${automation.name || 'Unnamed'}`);
  console.log(`📁 Input: ${initialFiles.length} file(s)`);

  if (!automation?.operations || automation.operations.length === 0) {
    throw new Error('No operations in automation');
  }

  let currentFiles = [...initialFiles];
  const automationPrefix = automation.name ? `${automation.name}_` : 'automated_';

  for (let i = 0; i < automation.operations.length; i++) {
    const operation = automation.operations[i];

    console.log(`\n📋 Step ${i + 1}/${automation.operations.length}: ${operation.operation}`);
    console.log(`   Input: ${currentFiles.length} file(s)`);

    try {
      onStepStart?.(i, operation.operation);

      const resultFiles = await executeToolOperationWithPrefix(
        operation.operation,
        operation.parameters || {},
        currentFiles,
        toolRegistry,
        i === automation.operations.length - 1 ? automationPrefix : '' // Only add prefix to final step
      );

      console.log(`✅ Step ${i + 1} completed: ${resultFiles.length} result files`);
      currentFiles = resultFiles;
      onStepComplete?.(i, resultFiles);

    } catch (error: any) {
      console.error(`❌ Step ${i + 1} failed:`, error);
      onStepError?.(i, error.message);
      throw error;
    }
  }

  console.log(`\n🎉 Automation complete: ${currentFiles.length} file(s)`);
  return currentFiles;
};

/**
 * Build the pipeline config JSON string for a server-side request.
 * Returns null if any step requires client-side processing (custom processor).
 */
export function buildPipelineJson(
  automation: any,
  toolRegistry: Partial<ToolRegistry>
): string | null {
  const needsFrontendFallback = automation.operations.some(
    (op: any) => toolRegistry[op.operation as ToolId]?.operationConfig?.customProcessor != null
  );
  if (needsFrontendFallback) return null;

  const pipeline = automation.operations.map((op: any) => {
    const toolConfig = toolRegistry[op.operation as ToolId]?.operationConfig;
    if (!toolConfig) throw new Error(`Tool operation not supported: ${op.operation}`);
    const parameters = { ...toolConfig.defaultParameters, ...(op.parameters ?? {}) };
    const rawEndpoint =
      typeof toolConfig.endpoint === 'function'
        ? toolConfig.endpoint(parameters)
        : toolConfig.endpoint;
    // Keep the leading slash — the backend's apiDocumentation map uses Swagger path keys
    // which all start with '/' (e.g. '/api/v1/general/rotate-pdf').
    const operation = rawEndpoint ?? '';
    return { operation, parameters };
  });

  return JSON.stringify({ name: automation.name, pipeline });
}

/**
 * Build the FormData payload for a pipeline request (handleData or jobs).
 * Returns null if any step requires client-side processing (custom processor).
 */
export function buildPipelineFormData(
  automation: any,
  files: File[],
  toolRegistry: Partial<ToolRegistry>
): FormData | null {
  const configJson = buildPipelineJson(automation, toolRegistry);
  if (!configJson) return null;

  const formData = new FormData();
  for (const file of files) formData.append('fileInput', file);
  formData.append('json', configJson);
  formData.append('sessionId', getSessionId());
  return formData;
}

/**
 * Submit an async pipeline job. Returns the jobId, or null if the automation requires
 * client-side processing (caller should fall back to executeBackendPipeline).
 */
export async function submitBackendJob(
  automation: any,
  files: File[],
  toolRegistry: Partial<ToolRegistry>
): Promise<string | null> {
  const formData = buildPipelineFormData(automation, files, toolRegistry);
  if (!formData) return null;
  const response = await apiClient.post<{ jobId: string }>('/api/v1/pipeline/jobs', formData);
  return response.data.jobId;
}

export interface BackendJobStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  error: string;
}

/** Poll job status. Throws if the job ID is not found (404). */
export async function getBackendJobStatus(jobId: string): Promise<BackendJobStatus> {
  const response = await apiClient.get<BackendJobStatus>(`/api/v1/pipeline/jobs/${jobId}/status`);
  return response.data;
}

/** Fetch the completed job result as File[]. */
export async function getBackendJobResult(jobId: string, automationName?: string): Promise<File[]> {
  const response = await apiClient.get<Blob>(`/api/v1/pipeline/jobs/${jobId}/result`, {
    responseType: 'blob',
  });
  const blob: Blob = response.data;
  const contentType: string = response.headers['content-type'] ?? '';
  if (contentType.includes('zip')) {
    const { files } = await AutomationFileProcessor.extractAutomationZipFiles(blob);
    return files;
  }
  const filename =
    getFilenameFromHeaders(response.headers['content-disposition'] ?? '') ??
    `${automationName ?? 'output'}.pdf`;
  return [new File([blob], filename, { type: blob.type || 'application/pdf', lastModified: Date.now() })];
}

/**
 * Execute an automation pipeline via POST /api/v1/pipeline/handleData.
 *
 * Falls back to executeAutomationSequence for automations that contain a step requiring
 * client-side processing (e.g. Adjust Contrast, Remove Annotations, Extract Pages).
 */
export const executeBackendPipeline = async (
  automation: any,
  initialFiles: File[],
  toolRegistry: Partial<ToolRegistry>
): Promise<File[]> => {
  if (!automation?.operations || automation.operations.length === 0) {
    throw new Error('No operations in automation');
  }

  // Fall back to frontend execution if any step needs client-side processing
  const needsFrontendFallback = automation.operations.some((op: any) =>
    toolRegistry[op.operation as ToolId]?.operationConfig?.customProcessor != null
  );
  if (needsFrontendFallback) {
    return executeAutomationSequence(automation, initialFiles, toolRegistry);
  }

  // Build PipelineConfig JSON — "pipeline" is the @JsonProperty key the backend expects.
  const pipeline = automation.operations.map((op: any) => {
    const toolConfig = toolRegistry[op.operation as ToolId]?.operationConfig;
    if (!toolConfig) throw new Error(`Tool operation not supported: ${op.operation}`);

    // Apply frontend defaults so the backend receives complete parameters
    const parameters = { ...toolConfig.defaultParameters, ...(op.parameters ?? {}) };

    // Keep the leading slash — PipelineProcessor normalizes both formats but the
    // apiDocumentation map (used by isValidOperation) uses Swagger path keys with '/'.
    const rawEndpoint = typeof toolConfig.endpoint === 'function'
      ? toolConfig.endpoint(parameters)
      : toolConfig.endpoint;
    const operation = rawEndpoint ?? '';

    return { operation, parameters };
  });

  const formData = new FormData();
  for (const file of initialFiles) {
    formData.append('fileInput', file);
  }
  formData.append('json', JSON.stringify({ name: automation.name, pipeline }));

  const response = await apiClient.post<Blob>('/api/v1/pipeline/handleData', formData, {
    responseType: 'blob',
    // Allow per-step timeout headroom proportional to the number of operations
    timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT * automation.operations.length,
  });

  const blob: Blob = response.data;

  // Validate the response is an actual PDF or ZIP before storing it.
  // An empty or XML/HTML error body from the backend would otherwise be
  // silently stored and render as "unknown length" in the PDF viewer.
  if (blob.size === 0) {
    throw new Error('Backend pipeline returned an empty response');
  }
  const header = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46 && header[4] === 0x2D; // %PDF-
  const isZip = header[0] === 0x50 && header[1] === 0x4B; // PK
  if (!isPdf && !isZip) {
    let hint = '';
    try { hint = ` Response preview: ${await blob.slice(0, 200).text()}`; } catch { /* ignore */ }
    throw new Error(`Backend pipeline returned unexpected content (not a PDF or ZIP).${hint}`);
  }

  const contentType: string = response.headers['content-type'] ?? '';

  if (contentType.includes('zip')) {
    const { files } = await AutomationFileProcessor.extractAutomationZipFiles(blob);
    return files;
  }

  const filename =
    getFilenameFromHeaders(response.headers['content-disposition'] ?? '') ??
    `${automation.name ?? 'output'}.pdf`;
  return [new File([blob], filename, { type: blob.type || 'application/pdf', lastModified: Date.now() })];
};
