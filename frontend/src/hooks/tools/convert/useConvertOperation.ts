import { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { ConvertParameters } from './useConvertParameters';

import { getEndpointUrl, isImageFormat } from '../../../utils/convertUtils';

export interface ConvertOperationHook {
  executeOperation: (
    parameters: ConvertParameters,
    selectedFiles: File[]
  ) => Promise<void>;
  
  // Flattened result properties for cleaner access
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  status: string;
  errorMessage: string | null;
  isLoading: boolean;
  
  // Result management functions
  resetResults: () => void;
  clearError: () => void;
}

export const useConvertOperation = (): ConvertOperationHook => {
  const { t } = useTranslation();
  const { 
    recordOperation, 
    markOperationApplied, 
    markOperationFailed,
    addFiles
  } = useFileContext();
  
  // Internal state management
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const buildFormData = useCallback((
    parameters: ConvertParameters,
    selectedFiles: File[]
  ) => {
    const formData = new FormData();
    
    selectedFiles.forEach(file => {
      formData.append("fileInput", file);
    });

    const { fromExtension, toExtension, imageOptions } = parameters;

    // Add conversion-specific parameters
    if (isImageFormat(toExtension)) {
      formData.append("imageFormat", toExtension);
      formData.append("colorType", imageOptions.colorType);
      formData.append("dpi", imageOptions.dpi.toString());
      formData.append("singleOrMultiple", imageOptions.singleOrMultiple);
    } else if (fromExtension === 'pdf' && ['docx', 'odt'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if (fromExtension === 'pdf' && ['pptx', 'odp'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if (fromExtension === 'pdf' && ['txt', 'rtf'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if ((isImageFormat(fromExtension) || fromExtension === 'image') && toExtension === 'pdf') {
      formData.append("fitOption", imageOptions.fitOption);
      formData.append("colorType", imageOptions.colorType);
      formData.append("autoRotate", imageOptions.autoRotate.toString());
    } else if (fromExtension === 'pdf' && toExtension === 'csv') {
      // CSV extraction - always process all pages for simplified workflow
      formData.append("pageNumbers", "all");
    }

    return formData;
  }, []);

  const createOperation = useCallback((
    parameters: ConvertParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `convert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles[0].name;

    const operation: FileOperation = {
      id: operationId,
      type: 'convert',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0].name,
        parameters: {
          fromExtension: parameters.fromExtension,
          toExtension: parameters.toExtension,
          imageOptions: parameters.imageOptions,
        },
        fileSize: selectedFiles[0].size
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const processResults = useCallback(async (blob: Blob, filename: string) => {
    try {
      // For single file conversions, create a file directly
      const convertedFile = new File([blob], filename, { type: blob.type });
      
      // Set local state for preview
      setFiles([convertedFile]);
      setThumbnails([]);
      setIsGeneratingThumbnails(true);

      // Add converted file to FileContext for future use
      await addFiles([convertedFile]);

      // Generate thumbnail for preview
      try {
        const thumbnail = await generateThumbnailForFile(convertedFile);
        setThumbnails([thumbnail]);
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${filename}:`, error);
        setThumbnails(['']);
      }
      
      setIsGeneratingThumbnails(false);
    } catch (error) {
      console.warn('Failed to process conversion result:', error);
    }
  }, [addFiles]);

  const executeOperation = useCallback(async (
    parameters: ConvertParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }

    // Check if this should be processed as separate files
    const shouldProcessSeparately = selectedFiles.length > 1 && (
      // Image to PDF with combineImages = false
      ((isImageFormat(parameters.fromExtension) || parameters.fromExtension === 'image') && 
       parameters.toExtension === 'pdf' && !parameters.imageOptions.combineImages) ||
      // Mixed file types (smart detection)
      (parameters.isSmartDetection && parameters.smartDetectionType === 'mixed')
    );

    if (shouldProcessSeparately) {
      // Process each file separately with appropriate endpoint
      await executeMultipleSeparateFiles(parameters, selectedFiles);
    } else {
      // Process all files together (default behavior)
      await executeSingleCombinedOperation(parameters, selectedFiles);
    }
  }, [t]);

  const executeMultipleSeparateFiles = async (
    parameters: ConvertParameters,
    selectedFiles: File[]
  ) => {
    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    const results: File[] = [];
    const thumbnails: string[] = [];

    try {
      // Process each file separately
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setStatus(t("convert.processingFile", `Processing file ${i + 1} of ${selectedFiles.length}...`));

        // Detect the specific file type for this file
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
        
        // Determine the best endpoint for this specific file type
        let endpoint = getEndpointUrl(fileExtension, parameters.toExtension);
        let fileSpecificParams = { ...parameters, fromExtension: fileExtension };
        
        // Fallback to file-to-pdf if specific endpoint doesn't exist
        if (!endpoint && parameters.toExtension === 'pdf') {
          endpoint = '/api/v1/convert/file/pdf';
          console.log(`Using file-to-pdf fallback for ${fileExtension} file: ${file.name}`);
        }

        if (!endpoint) {
          console.error(`No endpoint available for ${fileExtension} to ${parameters.toExtension}`);
          continue; // Skip this file
        }

        // Create individual operation for this file
        const { operation, operationId, fileId } = createOperation(fileSpecificParams, [file]);
        const formData = buildFormData(fileSpecificParams, [file]);

        recordOperation(fileId, operation);

        try {
          const response = await axios.post(endpoint, formData, { responseType: "blob" });
          const blob = new Blob([response.data]);
          
          // Generate filename for this specific file
          const originalName = file.name.split('.')[0];
          const filename = `${originalName}_converted.${parameters.toExtension}`;
          const convertedFile = new File([blob], filename, { type: blob.type });
          
          results.push(convertedFile);
          
          // Generate thumbnail
          try {
            const thumbnail = await generateThumbnailForFile(convertedFile);
            thumbnails.push(thumbnail);
          } catch (error) {
            console.warn(`Failed to generate thumbnail for ${filename}:`, error);
            thumbnails.push('');
          }

          markOperationApplied(fileId, operationId);
        } catch (error: any) {
          console.error(`Error converting file ${file.name}:`, error);
          markOperationFailed(fileId, operationId);
          // Continue with other files even if one fails
        }
      }

      if (results.length > 0) {
        // Set results for multiple files
        setFiles(results);
        setThumbnails(thumbnails);
        
        // Add all converted files to FileContext
        await addFiles(results);

        // For multiple separate files, use the first file for download
        const firstFileBlob = new Blob([results[0]]);
        const firstFileUrl = window.URL.createObjectURL(firstFileBlob);
        
        setDownloadUrl(firstFileUrl);
        setDownloadFilename(results[0].name);
        setStatus(t("convert.multipleFilesComplete", `Converted ${results.length} files successfully`));
      } else {
        setErrorMessage(t("convert.errorAllFilesFailed", "All files failed to convert"));
      }
    } catch (error) {
      console.error('Error in multiple operations:', error);
      setErrorMessage(t("convert.errorMultipleConversion", "An error occurred while converting multiple files"));
    } finally {
      setIsLoading(false);
    }
  };

  const executeSingleCombinedOperation = async (
    parameters: ConvertParameters,
    selectedFiles: File[]
  ) => {
    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);
    const formData = buildFormData(parameters, selectedFiles);

    // Get endpoint using utility function
    const endpoint = getEndpointUrl(parameters.fromExtension, parameters.toExtension);
    if (!endpoint) {
      setErrorMessage(t("convert.errorNotSupported", { from: parameters.fromExtension, to: parameters.toExtension }));
      return;
    }

    recordOperation(fileId, operation);

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(endpoint, formData, { responseType: "blob" });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      
      // Generate filename based on conversion
      const originalName = selectedFiles.length === 1 
        ? selectedFiles[0].name.split('.')[0]
        : 'combined_images';
      const filename = `${originalName}_converted.${parameters.toExtension}`;
      
      setDownloadUrl(url);
      setDownloadFilename(filename);
      setStatus(t("downloadComplete"));

      await processResults(blob, filename);
      markOperationApplied(fileId, operationId);
    } catch (error: any) {
      console.error(error);
      let errorMsg = t("convert.errorConversion", "An error occurred while converting the file.");
      if (error.response?.data && typeof error.response.data === 'string') {
        errorMsg = error.response.data;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
      markOperationFailed(fileId, operationId, errorMsg);
    } finally {
      setIsLoading(false);
    }
  };


  const resetResults = useCallback(() => {
    // Clean up blob URLs to prevent memory leaks
    if (downloadUrl) {
      window.URL.revokeObjectURL(downloadUrl);
    }
    
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, [downloadUrl]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        window.URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return {
    executeOperation,
    
    // Flattened result properties for cleaner access
    files,
    thumbnails,
    isGeneratingThumbnails,
    downloadUrl,
    downloadFilename,
    status,
    errorMessage,
    isLoading,
    
    // Result management functions
    resetResults,
    clearError,
  };
};