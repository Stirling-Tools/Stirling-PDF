import axios from 'axios';
import { ToolRegistry } from '../data/toolsTaxonomy';
import { zipFileService } from '../services/zipFileService';

/**
 * Extract zip files from response blob
 */
const extractZipFiles = async (blob: Blob): Promise<File[]> => {
  try {
    // Convert blob to File for the zip service
    const zipFile = new File([blob], `response_${Date.now()}.zip`, { type: 'application/zip' });
    
    // Extract PDF files from the ZIP
    const result = await zipFileService.extractPdfFiles(zipFile);
    
    if (!result.success || result.extractedFiles.length === 0) {
      console.error('ZIP extraction failed:', result.errors);
      throw new Error(`ZIP extraction failed: ${result.errors.join(', ')}`);
    }
    
    console.log(`📦 Extracted ${result.extractedFiles.length} files from ZIP`);
    return result.extractedFiles;
  } catch (error) {
    console.error('Failed to extract ZIP files:', error);
    // Fallback: treat as single PDF file
    const file = new File([blob], `result_${Date.now()}.pdf`, { type: 'application/pdf' });
    return [file];
  }
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
  console.log(`🔧 Executing tool: ${operationName}`, { parameters, fileCount: files.length });
  
  const config = toolRegistry[operationName]?.operationConfig;
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

    if (config.multiFileEndpoint) {
      // Multi-file processing - single API call with all files
      const endpoint = typeof config.endpoint === 'function' 
        ? config.endpoint(parameters) 
        : config.endpoint;
      
      console.log(`🌐 Making multi-file request to: ${endpoint}`);
      const formData = (config.buildFormData as (params: any, files: File[]) => FormData)(parameters, files);
      console.log(`📤 FormData entries:`, Array.from(formData.entries()));
      
      const response = await axios.post(endpoint, formData, { 
        responseType: 'blob',
        timeout: 300000 // 5 minute timeout for large files
      });

      console.log(`📥 Response status: ${response.status}, size: ${response.data.size} bytes`);

      // Multi-file responses are typically ZIP files
      const resultFiles = await extractZipFiles(response.data);
      console.log(`📁 Extracted ${resultFiles.length} files from response`);
      return resultFiles;

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
        const formData = (config.buildFormData as (params: any, file: File) => FormData)(parameters, file);
        console.log(`📤 FormData entries:`, Array.from(formData.entries()));
        
        const response = await axios.post(endpoint, formData, { 
          responseType: 'blob',
          timeout: 300000 // 5 minute timeout for large files
        });

        console.log(`📥 Response ${i+1} status: ${response.status}, size: ${response.data.size} bytes`);

        // Create result file
        const resultFile = new File(
          [response.data], 
          `processed_${file.name}`, 
          { type: 'application/pdf' }
        );
        resultFiles.push(resultFile);
        console.log(`✅ Created result file: ${resultFile.name}`);
      }

      console.log(`🎉 Single-file processing complete: ${resultFiles.length} files`);
      return resultFiles;
    }

  } catch (error: any) {
    console.error(`Tool operation ${operationName} failed:`, error);
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
  console.log(`🚀 Starting automation sequence: ${automation.name || 'Unnamed'}`);
  console.log(`📁 Initial files: ${initialFiles.length}`);
  console.log(`🔧 Operations: ${automation.operations?.length || 0}`);
  
  if (!automation?.operations || automation.operations.length === 0) {
    throw new Error('No operations in automation');
  }

  let currentFiles = [...initialFiles];

  for (let i = 0; i < automation.operations.length; i++) {
    const operation = automation.operations[i];
    
    console.log(`📋 Step ${i + 1}/${automation.operations.length}: ${operation.operation}`);
    console.log(`📄 Input files: ${currentFiles.length}`);
    console.log(`⚙️ Parameters:`, operation.parameters || {});
    
    try {
      onStepStart?.(i, operation.operation);
      
      const resultFiles = await executeToolOperation(
        operation.operation, 
        operation.parameters || {}, 
        currentFiles,
        toolRegistry
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