import { useCallback, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { zipFileService } from '../../../services/zipFileService';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import {makeApiUrl} from '../../../utils/api';

export interface CompressParameters {
  compressionLevel: number;
  grayscale: boolean;
  expectedSize: string;
  compressionMethod: 'quality' | 'filesize';
  fileSizeValue: string;
  fileSizeUnit: 'KB' | 'MB';
}

export interface CompressOperationHook {
  executeOperation: (
    parameters: CompressParameters,
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

export const useCompressOperation = (): CompressOperationHook => {
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
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const buildFormData = useCallback((
    parameters: CompressParameters,
    selectedFiles: File[]
  ) => {
    const formData = new FormData();
    
    selectedFiles.forEach(file => {
      formData.append("fileInput", file);
    });

    if (parameters.compressionMethod === 'quality') {
      formData.append("optimizeLevel", parameters.compressionLevel.toString());
    } else {
      // File size method
      const fileSize = parameters.fileSizeValue ? `${parameters.fileSizeValue}${parameters.fileSizeUnit}` : '';
      if (fileSize) {
        formData.append("expectedOutputSize", fileSize);
      }
    }
    
    formData.append("grayscale", parameters.grayscale.toString());

    const endpoint = "/api/v1/misc/compress-pdf";

    return { formData, endpoint };
  }, []);

  const createOperation = useCallback((
    parameters: CompressParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `compress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles[0].name;

    const operation: FileOperation = {
      id: operationId,
      type: 'compress',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0].name,
        parameters: {
          compressionLevel: parameters.compressionLevel,
          grayscale: parameters.grayscale,
          expectedSize: parameters.expectedSize,
        },
        fileSize: selectedFiles[0].size
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const processResults = useCallback(async (blob: Blob, selectedFiles: File[]) => {
    try {
      // Check if the response is a PDF file directly or a ZIP file
      const contentType = blob.type;
      console.log('Response content type:', contentType);
      
      if (contentType === 'application/pdf') {
        // Direct PDF response
        const originalFileName = selectedFiles[0].name;
        const pdfFile = new File([blob], `compressed_${originalFileName}`, { type: "application/pdf" });
        setFiles([pdfFile]);
        setThumbnails([]);
        setIsGeneratingThumbnails(true);
        
        // Add file to FileContext
        await addFiles([pdfFile]);
        
        // Generate thumbnail
        const thumbnail = await generateThumbnailForFile(pdfFile);
        setThumbnails([thumbnail || '']);
        setIsGeneratingThumbnails(false);
      } else {
        // ZIP file response (like split operation)
        const zipFile = new File([blob], "compress_result.zip", { type: "application/zip" });
        const extractionResult = await zipFileService.extractPdfFiles(zipFile);

        if (extractionResult.success && extractionResult.extractedFiles.length > 0) {
          // Set local state for preview
          setFiles(extractionResult.extractedFiles);
          setThumbnails([]);
          setIsGeneratingThumbnails(true);

          // Add extracted files to FileContext for future use
          await addFiles(extractionResult.extractedFiles);

          const thumbnails = await Promise.all(
            extractionResult.extractedFiles.map(async (file) => {
              try {
                const thumbnail = await generateThumbnailForFile(file);
                return thumbnail || '';
              } catch (error) {
                console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
                return '';
              }
            })
          );

          setThumbnails(thumbnails);
          setIsGeneratingThumbnails(false);
        }
      }
    } catch (extractError) {
      console.warn('Failed to process results:', extractError);
    }
  }, [addFiles]);

  const executeOperation = useCallback(async (
    parameters: CompressParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);
    const { formData, endpoint } = buildFormData(parameters, selectedFiles);

    recordOperation(fileId, operation);

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(makeApiUrl(endpoint), formData, { responseType: "blob" });
      
      // Determine the correct content type from the response
      const contentType = response.headers['content-type'] || 'application/zip';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      
      // Generate dynamic filename based on original file and content type
      const originalFileName = selectedFiles[0].name;
      const filename = `compressed_${originalFileName}`;
      setDownloadFilename(filename);
      setDownloadUrl(url);
      setStatus(t("downloadComplete"));

      await processResults(blob, selectedFiles);
      markOperationApplied(fileId, operationId);
    } catch (error: any) {
      console.error(error);
      let errorMsg = t("error.pdfPassword", "An error occurred while compressing the PDF.");
      if (error.response?.data && typeof error.response.data === 'string') {
        errorMsg = error.response.data;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
      setStatus(t("error._value", "Compression failed."));
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