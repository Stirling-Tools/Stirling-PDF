import { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { ConvertParameters } from './useConvertParameters';
import { detectFileExtension } from '../../../utils/fileUtils';
import { createFileFromApiResponse } from '../../../utils/fileResponseUtils';

import { getEndpointUrl, isImageFormat, isWebFormat } from '../../../utils/convertUtils';

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

const shouldProcessFilesSeparately = (
  selectedFiles: File[], 
  parameters: ConvertParameters
): boolean => {
  return selectedFiles.length > 1 && (
    // Image to PDF with combineImages = false
    ((isImageFormat(parameters.fromExtension) || parameters.fromExtension === 'image') && 
     parameters.toExtension === 'pdf' && !parameters.imageOptions.combineImages) ||
    // PDF to image conversions (each PDF should generate its own image file)
    (parameters.fromExtension === 'pdf' && isImageFormat(parameters.toExtension)) ||
    // PDF to PDF/A conversions (each PDF should be processed separately)
    (parameters.fromExtension === 'pdf' && parameters.toExtension === 'pdfa') ||
    // Web files to PDF conversions (each web file should generate its own PDF)
    ((isWebFormat(parameters.fromExtension) || parameters.fromExtension === 'web') && 
     parameters.toExtension === 'pdf') ||
    // Web files smart detection
    (parameters.isSmartDetection && parameters.smartDetectionType === 'web') ||
    // Mixed file types (smart detection)
    (parameters.isSmartDetection && parameters.smartDetectionType === 'mixed')
  );
};

const createFileFromResponse = (
  responseData: any,
  headers: any,
  originalFileName: string,
  targetExtension: string
): File => {
  const originalName = originalFileName.split('.')[0];
  const fallbackFilename = `${originalName}_converted.${targetExtension}`;
  
  return createFileFromApiResponse(responseData, headers, fallbackFilename);
};

const generateThumbnailsForFiles = async (files: File[]): Promise<string[]> => {
  const thumbnails: string[] = [];
  
  for (const file of files) {
    try {
      const thumbnail = await generateThumbnailForFile(file);
      thumbnails.push(thumbnail);
    } catch (error) {
      thumbnails.push('');
    }
  }
  
  return thumbnails;
};

const createDownloadInfo = async (files: File[]): Promise<{ url: string; filename: string }> => {
  if (files.length === 1) {
    const url = window.URL.createObjectURL(files[0]);
    return { url, filename: files[0].name };
  } else {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    files.forEach(file => {
      zip.file(file.name, file);
    });
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = window.URL.createObjectURL(zipBlob);
    
    return { url: zipUrl, filename: 'converted_files.zip' };
  }
};

export const useConvertOperation = (): ConvertOperationHook => {
  const { t } = useTranslation();
  const { 
    recordOperation, 
    markOperationApplied, 
    markOperationFailed,
    addFiles
  } = useFileContext();
  
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

    const { fromExtension, toExtension, imageOptions, htmlOptions, emailOptions, pdfaOptions } = parameters;

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
    } else if ((fromExtension === 'html' || fromExtension === 'zip') && toExtension === 'pdf') {
      formData.append("zoom", htmlOptions.zoomLevel.toString());
    } else if (fromExtension === 'eml' && toExtension === 'pdf') {
      formData.append("includeAttachments", emailOptions.includeAttachments.toString());
      formData.append("maxAttachmentSizeMB", emailOptions.maxAttachmentSizeMB.toString());
      formData.append("downloadHtml", emailOptions.downloadHtml.toString());
      formData.append("includeAllRecipients", emailOptions.includeAllRecipients.toString());
    } else if (fromExtension === 'pdf' && toExtension === 'pdfa') {
      formData.append("outputFormat", pdfaOptions.outputFormat);
    } else if (fromExtension === 'pdf' && toExtension === 'csv') {
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
          htmlOptions: parameters.htmlOptions,
          emailOptions: parameters.emailOptions,
          pdfaOptions: parameters.pdfaOptions,
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

    if (shouldProcessFilesSeparately(selectedFiles, parameters)) {
      await executeMultipleSeparateFiles(parameters, selectedFiles);
    } else {
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

    try {
      // Process each file separately
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setStatus(t("convert.processingFile", `Processing file ${i + 1} of ${selectedFiles.length}...`));

        const fileExtension = detectFileExtension(file.name);
        let endpoint = getEndpointUrl(fileExtension, parameters.toExtension);
        let fileSpecificParams = { ...parameters, fromExtension: fileExtension };
        if (!endpoint && parameters.toExtension === 'pdf') {
          endpoint = '/api/v1/convert/file/pdf';
          console.log(`Using file-to-pdf fallback for ${fileExtension} file: ${file.name}`);
        }

        if (!endpoint) {
          console.error(`No endpoint available for ${fileExtension} to ${parameters.toExtension}`);
          continue;
        }

        const { operation, operationId, fileId } = createOperation(fileSpecificParams, [file]);
        const formData = buildFormData(fileSpecificParams, [file]);

        recordOperation(fileId, operation);

        try {
          const response = await axios.post(endpoint, formData, { responseType: "blob" });
          
          // Use utility function to create file from response
          const convertedFile = createFileFromResponse(
            response.data,
            response.headers,
            file.name,
            parameters.toExtension
          );
          results.push(convertedFile);

          markOperationApplied(fileId, operationId);
        } catch (error: any) {
          console.error(`Error converting file ${file.name}:`, error);
          markOperationFailed(fileId, operationId);
        }
      }

      if (results.length > 0) {
        
        const generatedThumbnails = await generateThumbnailsForFiles(results);
        
        setFiles(results);
        setThumbnails(generatedThumbnails);
        
        await addFiles(results);

        try {
          const { url, filename } = await createDownloadInfo(results);
          setDownloadUrl(url);
          setDownloadFilename(filename);
        } catch (error) {
          console.error('Failed to create download info:', error);
          const url = window.URL.createObjectURL(results[0]);
          setDownloadUrl(url);
          setDownloadFilename(results[0].name);
        }
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
      
      // Use utility function to create file from response
      const originalFileName = selectedFiles.length === 1 
        ? selectedFiles[0].name
        : 'combined_files.pdf'; // Default extension for combined files
      
      const convertedFile = createFileFromResponse(
        response.data,
        response.headers,
        originalFileName,
        parameters.toExtension
      );
      
      const url = window.URL.createObjectURL(convertedFile);
      setDownloadUrl(url);
      setDownloadFilename(convertedFile.name);
      setStatus(t("downloadComplete"));

      // Update local files state for hook consumers
      setFiles([convertedFile]);
      
      await addFiles([convertedFile]);
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