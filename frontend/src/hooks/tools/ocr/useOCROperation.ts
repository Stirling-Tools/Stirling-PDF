import { useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { OCRParameters } from '../../../components/tools/ocr/OCRSettings';

export interface OCROperationHook {
  files: File[];
  thumbnails: string[];
  downloadUrl: string | null;
  downloadFilename: string | null;
  isLoading: boolean;
  isGeneratingThumbnails: boolean;
  status: string;
  errorMessage: string | null;
  executeOperation: (parameters: OCRParameters, selectedFiles: File[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
}

export const useOCROperation = (): OCROperationHook => {
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

  // Track blob URLs for cleanup
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const cleanupBlobUrls = useCallback(() => {
    blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error);
      }
    });
    setBlobUrls([]);
  }, [blobUrls]);

  const buildFormData = useCallback((
    parameters: OCRParameters,
    file: File
  ) => {
    const formData = new FormData();

    // Add the file
    formData.append('fileInput', file);

    // Add languages as multiple parameters with same name (like checkboxes)
    parameters.languages.forEach(lang => {
      formData.append('languages', lang);
    });

    // Add other parameters
    formData.append('ocrType', parameters.ocrType);
    formData.append('ocrRenderType', parameters.ocrRenderType);
    
    // Handle additional options - convert array to individual boolean parameters
    formData.append('sidecar', parameters.additionalOptions.includes('sidecar').toString());
    formData.append('deskew', parameters.additionalOptions.includes('deskew').toString());
    formData.append('clean', parameters.additionalOptions.includes('clean').toString());
    formData.append('cleanFinal', parameters.additionalOptions.includes('cleanFinal').toString());
    formData.append('removeImagesAfter', parameters.additionalOptions.includes('removeImagesAfter').toString());

    const endpoint = '/api/v1/misc/ocr-pdf';

    return { formData, endpoint };
  }, []);

  const createOperation = useCallback((
    parameters: OCRParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles.map(f => f.name).join(',');

    const operation: FileOperation = {
      id: operationId,
      type: 'ocr',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0]?.name,
        parameters: {
          languages: parameters.languages,
          ocrType: parameters.ocrType,
          ocrRenderType: parameters.ocrRenderType,
          additionalOptions: parameters.additionalOptions,
        },
        fileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const executeOperation = useCallback(async (
    parameters: OCRParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected") || "No file selected");
      return;
    }
    
    if (parameters.languages.length === 0) {
      setErrorMessage('Please select at least one language for OCR processing.');
      return;
    }

    const validFiles = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      setErrorMessage('No valid files to process. All selected files are empty.');
      return;
    }

    if (validFiles.length < selectedFiles.length) {
      console.warn(`Skipping ${selectedFiles.length - validFiles.length} empty files`);
    }

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);

    recordOperation(fileId, operation);

    setStatus(t("loading") || "Loading...");
    setIsLoading(true);
    setErrorMessage(null);
    setFiles([]);
    setThumbnails([]);

    try {
      const processedFiles: File[] = [];
      const failedFiles: string[] = [];

      // OCR typically processes one file at a time
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setStatus(`Processing OCR for ${file.name} (${i + 1}/${validFiles.length})`);

        try {
          const { formData, endpoint } = buildFormData(parameters, file);
          const response = await axios.post(endpoint, formData, { responseType: "blob" });

          const contentType = response.headers['content-type'] || 'application/pdf';
          const blob = new Blob([response.data], { type: contentType });
          const processedFile = new File([blob], `ocr_${file.name}`, { type: contentType });

          processedFiles.push(processedFile);
        } catch (fileError) {
          console.error(`Failed to process OCR for ${file.name}:`, fileError);
          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0 && processedFiles.length === 0) {
        throw new Error(`Failed to process OCR for all files: ${failedFiles.join(', ')}`);
      }

      if (failedFiles.length > 0) {
        setStatus(`Processed ${processedFiles.length}/${validFiles.length} files. Failed: ${failedFiles.join(', ')}`);
      } else {
        setStatus(`OCR completed successfully for ${processedFiles.length} file(s)`);
      }

      setFiles(processedFiles);
      setIsGeneratingThumbnails(true);

      await addFiles(processedFiles);

      // Cleanup old blob URLs
      cleanupBlobUrls();

      // Create download URL
      if (processedFiles.length === 1) {
        const url = window.URL.createObjectURL(processedFiles[0]);
        setDownloadUrl(url);
        setBlobUrls([url]);
        setDownloadFilename(`ocr_${selectedFiles[0].name}`);
      } else {
        // For multiple files, we could create a zip, but for now just handle the first file
        const url = window.URL.createObjectURL(processedFiles[0]);
        setDownloadUrl(url);
        setBlobUrls([url]);
        setDownloadFilename(`ocr_${validFiles.length}_files.pdf`);
      }

             markOperationApplied(fileId, operationId);
       setIsGeneratingThumbnails(false);
     } catch (error) {
       console.error('OCR operation error:', error);
       const errorMessage = error instanceof Error ? error.message : 'OCR operation failed';
       setErrorMessage(errorMessage);
       setStatus('');
       markOperationFailed(fileId, operationId, errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [buildFormData, createOperation, recordOperation, addFiles, cleanupBlobUrls, markOperationApplied, markOperationFailed, t]);

  const resetResults = useCallback(() => {
    setFiles([]);
    setThumbnails([]);
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
    setIsGeneratingThumbnails(false);
    cleanupBlobUrls();
  }, [cleanupBlobUrls]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    files,
    thumbnails,
    downloadUrl,
    downloadFilename,
    isLoading,
    isGeneratingThumbnails,
    status,
    errorMessage,
    executeOperation,
    resetResults,
    clearError,
  };
}; 