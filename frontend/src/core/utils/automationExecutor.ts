import apiClient from '@app/services/apiClient';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';
import { AUTOMATION_CONSTANTS } from '@app/constants/automation';
import { AutomationFileProcessor } from '@app/utils/automationFileProcessor';
import { ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { processResponse } from '@app/utils/toolResponseProcessor';

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
  toolRegistry: ToolRegistry
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
  toolRegistry: ToolRegistry,
  filePrefix: string = AUTOMATION_CONSTANTS.FILE_PREFIX
): Promise<File[]> => {
  const config = toolRegistry[operationName as ToolId]?.operationConfig;
  if (!config) {
    throw new Error(`Tool operation not supported: ${operationName}`);
  }

  try {
    // Check if tool uses custom processor (like Convert tool)
    if (config.customProcessor) {
      const resultFiles = await config.customProcessor(parameters, files);
      return resultFiles;
    }

    // Execute based on tool type
    if (config.toolType === ToolType.multiFile) {
      return await executeMultiFileOperation(config, parameters, files, filePrefix);
    } else {
      return await executeSingleFileOperation(config, parameters, files, filePrefix);
    }

  } catch (error: any) {
    console.error(`❌ ${operationName} failed:`, error);
    throw new Error(`${operationName} operation failed: ${error.response?.data || error.message}`);
  }
};

/**
 * Execute an entire automation sequence
 */
export const executeAutomationSequence = async (
  automation: any,
  initialFiles: File[],
  toolRegistry: ToolRegistry,
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
