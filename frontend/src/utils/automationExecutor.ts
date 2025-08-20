import axios from 'axios';

// Tool operation configurations extracted from the hook implementations
const TOOL_CONFIGS: Record<string, any> = {
  'compressPdfs': {
    endpoint: '/api/v1/misc/compress-pdf',
    multiFileEndpoint: false,
    buildFormData: (parameters: any, file: File): FormData => {
      const formData = new FormData();
      formData.append("fileInput", file);

      if (parameters.compressionMethod === 'quality') {
        formData.append("optimizeLevel", parameters.compressionLevel?.toString() || '1');
      } else {
        const fileSize = parameters.fileSizeValue ? `${parameters.fileSizeValue}${parameters.fileSizeUnit}` : '';
        if (fileSize) {
          formData.append("expectedOutputSize", fileSize);
        }
      }

      formData.append("grayscale", parameters.grayscale?.toString() || 'false');
      return formData;
    }
  },

  'split': {
    endpoint: (parameters: any): string => {
      // Simplified endpoint selection - you'd need the full logic from useSplitOperation
      return "/api/v1/general/split-pages";
    },
    multiFileEndpoint: true,
    buildFormData: (parameters: any, files: File[]): FormData => {
      const formData = new FormData();
      files.forEach(file => {
        formData.append("fileInput", file);
      });
      
      // Add split parameters - simplified version
      if (parameters.pages) {
        formData.append("pageNumbers", parameters.pages);
      }
      
      return formData;
    }
  },

  'addPassword': {
    endpoint: '/api/v1/security/add-password',
    multiFileEndpoint: false,
    buildFormData: (parameters: any, file: File): FormData => {
      const formData = new FormData();
      formData.append("fileInput", file);
      
      if (parameters.password) {
        formData.append("password", parameters.password);
      }
      
      // Add other password parameters as needed
      return formData;
    }
  }

  // TODO: Add configurations for other tools
};

/**
 * Extract zip files from response blob
 */
const extractZipFiles = async (blob: Blob): Promise<File[]> => {
  // This would need the actual zip extraction logic from the codebase
  // For now, create a single file from the blob
  const file = new File([blob], `result_${Date.now()}.pdf`, { type: 'application/pdf' });
  return [file];
};

/**
 * Execute a tool operation directly without using React hooks
 */
export const executeToolOperation = async (
  operationName: string, 
  parameters: any, 
  files: File[]
): Promise<File[]> => {
  console.log(`🔧 Executing tool: ${operationName}`, { parameters, fileCount: files.length });
  
  const config = TOOL_CONFIGS[operationName];
  if (!config) {
    console.error(`❌ Tool operation not supported: ${operationName}`);
    throw new Error(`Tool operation not supported: ${operationName}`);
  }

  console.log(`📋 Using config:`, config);

  try {
    if (config.multiFileEndpoint) {
      // Multi-file processing - single API call with all files
      const endpoint = typeof config.endpoint === 'function' 
        ? config.endpoint(parameters) 
        : config.endpoint;
      
      console.log(`🌐 Making multi-file request to: ${endpoint}`);
      const formData = config.buildFormData(parameters, files);
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
        const formData = config.buildFormData(parameters, file);
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
        currentFiles
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