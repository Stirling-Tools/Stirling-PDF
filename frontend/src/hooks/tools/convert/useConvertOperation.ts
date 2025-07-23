import { useCallback, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { makeApiUrl } from '../../../utils/api';
import { ConvertParameters } from './useConvertParameters';
import { 
  CONVERSION_ENDPOINTS,
  ENDPOINT_NAMES,
  EXTENSION_TO_ENDPOINT
} from '../../../constants/convertConstants';

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
    if (['png', 'jpg'].includes(toExtension)) {
      formData.append("imageFormat", toExtension === 'jpg' ? 'jpg' : 'png');
      formData.append("colorType", imageOptions.colorType);
      formData.append("dpi", imageOptions.dpi.toString());
      formData.append("singleOrMultiple", imageOptions.singleOrMultiple);
    } else if (fromExtension === 'pdf' && ['docx', 'odt'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if (fromExtension === 'pdf' && ['pptx', 'odp'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if (fromExtension === 'pdf' && ['txt', 'rtf'].includes(toExtension)) {
      formData.append("outputFormat", toExtension);
    } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(fromExtension) && toExtension === 'pdf') {
      formData.append("fitOption", "fillPage");
      formData.append("colorType", imageOptions.colorType);
      formData.append("autoRotate", "true");
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

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);
    const formData = buildFormData(parameters, selectedFiles);

    // Get endpoint using constants
    const getEndpoint = () => {
      const { fromExtension, toExtension } = parameters;
      const endpointKey = EXTENSION_TO_ENDPOINT[fromExtension]?.[toExtension];
      if (!endpointKey) return '';
      
      // Find the endpoint URL from CONVERSION_ENDPOINTS using the endpoint name
      for (const [key, endpoint] of Object.entries(CONVERSION_ENDPOINTS)) {
        if (ENDPOINT_NAMES[key as keyof typeof ENDPOINT_NAMES] === endpointKey) {
          return endpoint;
        }
      }
      return '';
    };

    const endpoint = getEndpoint();
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
      const originalName = selectedFiles[0].name.split('.')[0];
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
      setStatus(t("error._value", "Conversion failed."));
      markOperationFailed(fileId, operationId, errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [t, createOperation, buildFormData, recordOperation, markOperationApplied, markOperationFailed, processResults]);

  const resetResults = useCallback(() => {
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

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