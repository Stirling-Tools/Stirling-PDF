import axios from 'axios';
import { ToolRegistry } from '../data/toolsTaxonomy';
import { AUTOMATION_CONSTANTS } from '../constants/automation';
import { AutomationFileProcessor } from './automationFileProcessor';
import { ToolType } from '../hooks/tools/shared/useToolOperation';
import { processResponse } from './toolResponseProcessor';


/**
 * Execute a tool operation directly without using React hooks
 */
export const executeToolOperation = async (
  operationName: string,
  parameters: Record<string, unknown>,
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
  parameters: Record<string, unknown>,
  files: File[],
  toolRegistry: ToolRegistry,
  filePrefix: string = AUTOMATION_CONSTANTS.FILE_PREFIX
): Promise<File[]> => {
  console.log(`🔧 Executing tool: ${operationName}`, { parameters, fileCount: files.length });

  const config = toolRegistry[operationName as keyof ToolRegistry]?.operationConfig;
  if (!config) {
    console.error(`❌ Tool operation not supported: ${operationName}`);
    throw new Error(`Tool operation not supported: ${operationName}`);
  }

  console.log(`📋 Using config:`, config);

  try {
    // Check if tool uses custom processor (like Convert tool)
    if (config.customProcessor) {
      console.log(`🎯 Using custom processor for ${config.operationType}`);
      const resultFiles = await config.customProcessor(parameters, files);
      console.log(`✅ Custom processor returned ${resultFiles.length} files`);
      return resultFiles;
    }

    if (config.toolType === ToolType.multiFile) {
      // Multi-file processing - single API call with all files
      const endpoint = typeof config.endpoint === 'function'
        ? config.endpoint(parameters)
        : config.endpoint;

      console.log(`🌐 Making multi-file request to: ${endpoint}`);
      const formData = (config.buildFormData as (params: Record<string, unknown>, files: File[]) => FormData)(parameters, files);
      console.log(`📤 FormData entries:`, Array.from(formData.entries()));

      const response = await axios.post(endpoint, formData, {
        responseType: 'blob',
        timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT
      });

      console.log(`📥 Response status: ${response.status}, size: ${response.data.size} bytes`);

      // Multi-file responses are typically ZIP files, but may be single files (e.g. split with merge=true)
      let result;
      if (response.data.type === 'application/pdf' ||
          (response.headers && response.headers['content-type'] === 'application/pdf')) {
        // Single PDF response (e.g. split with merge option) - use processResponse to respect preserveBackendFilename
        const processedFiles = await processResponse(
          response.data as Blob,
          files,
          filePrefix,
          undefined,
          config.preserveBackendFilename ? Object.fromEntries(
            Object.entries(response.headers || {}).map(([key, value]: [string, unknown]) => [key, String(value)])
          ) : undefined
        );
        result = {
          success: true,
          files: processedFiles,
          errors: []
        };
      } else {
        // ZIP response
        result = await AutomationFileProcessor.extractAutomationZipFiles(response.data);
      }

      if (result.errors.length > 0) {
        console.warn(`⚠️ File processing warnings:`, result.errors);
      }
      // Apply prefix to files, replacing any existing prefix
      // Skip prefixing if preserveBackendFilename is true and backend provided a filename
      const processedFiles = filePrefix && !config.preserveBackendFilename
        ? result.files.map(file => {
            const nameWithoutPrefix = file.name.replace(/^[^_]*_/, '');
            return new File([file], `${filePrefix}${nameWithoutPrefix}`, { type: file.type });
          })
        : result.files;

      console.log(`📁 Processed ${processedFiles.length} files from response`);
      return processedFiles;

    } else {
      // Single-file processing - separate API call per file
      console.log(`🔄 Processing ${files.length} files individually`);
      const resultFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const endpoint = typeof config.endpoint === 'function'
          ? config.endpoint(parameters)
          : config.endpoint;

        console.log(`🌐 Making single-file request ${i+1}/${files.length} to: ${endpoint} for file: ${file.name}`);
        const formData = (config.buildFormData as (params: Record<string, unknown>, file: File) => FormData)(parameters, file);
        console.log(`📤 FormData entries:`, Array.from(formData.entries()));

        const response = await axios.post(endpoint, formData, {
          responseType: 'blob',
          timeout: AUTOMATION_CONSTANTS.OPERATION_TIMEOUT
        });

        console.log(`📥 Response ${i+1} status: ${response.status}, size: ${response.data.size} bytes`);

        // Create result file using processResponse to respect preserveBackendFilename setting
        const processedFiles = await processResponse(
          response.data,
          [file],
          filePrefix,
          undefined,
          config.preserveBackendFilename ? response.headers : undefined
        );
        resultFiles.push(...processedFiles);
        console.log(`✅ Created result file(s): ${processedFiles.map(f => f.name).join(', ')}`);
      }

      console.log(`🎉 Single-file processing complete: ${resultFiles.length} files`);
      return resultFiles;
    }

  } catch (error: any) {
    console.error(`Tool operation ${operationName} failed:`, error);
    throw new Error(`${operationName} operation failed: ${error.response?.data ?? error.message}`);
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
  console.log(`🚀 Starting automation sequence: ${automation.name ?? 'Unnamed'}`);
  console.log(`📁 Initial files: ${initialFiles.length}`);
  console.log(`🔧 Operations: ${automation.operations?.length ?? 0}`);

  if (!automation?.operations || automation.operations.length === 0) {
    throw new Error('No operations in automation');
  }

  let currentFiles = [...initialFiles];
  const automationPrefix = automation.name ? `${automation.name}_` : 'automated_';

  for (let i = 0; i < automation.operations.length; i++) {
    const operation = automation.operations[i];

    console.log(`📋 Step ${i + 1}/${automation.operations.length}: ${operation.operation}`);
    console.log(`📄 Input files: ${currentFiles.length}`);
    console.log(`⚙️ Parameters:`, operation.parameters ?? {});

    try {
      onStepStart?.(i, operation.operation);

      const resultFiles = await executeToolOperationWithPrefix(
        operation.operation,
        operation.parameters ?? {},
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

  console.log(`🎉 Automation sequence completed: ${currentFiles.length} final files`);
  return currentFiles;
};
