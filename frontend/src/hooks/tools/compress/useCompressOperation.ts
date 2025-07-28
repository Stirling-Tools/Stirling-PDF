import { useCallback, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { zipFileService } from '../../../services/zipFileService';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';

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
    parameters: CompressParameters,
    file: File
  ) => {
    const formData = new FormData();

    formData.append("fileInput", file);

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
    const fileId = selectedFiles.map(f => f.name).join(',');

    const operation: FileOperation = {
      id: operationId,
      type: 'compress',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileNames: selectedFiles.map(f => f.name),
        parameters: {
          compressionLevel: parameters.compressionLevel,
          grayscale: parameters.grayscale,
          expectedSize: parameters.expectedSize,
        },
        totalFileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0),
        fileCount: selectedFiles.length
      }
    };

    return { operation, operationId, fileId };
  }, []);


  const executeOperation = useCallback(async (
    parameters: CompressParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }
    const validFiles = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      setErrorMessage('No valid files to compress. All selected files are empty.');
      return;
    }

    if (validFiles.length < selectedFiles.length) {
      console.warn(`Skipping ${selectedFiles.length - validFiles.length} empty files`);
    }

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);

    recordOperation(fileId, operation);

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);
    setFiles([]);
    setThumbnails([]);

    try {
      const compressedFiles: File[] = [];

      const failedFiles: string[] = [];

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setStatus(`Compressing ${file.name} (${i + 1}/${validFiles.length})`);

        try {
          const { formData, endpoint } = buildFormData(parameters, file);
          const response = await axios.post(endpoint, formData, { responseType: "blob" });

          const contentType = response.headers['content-type'] || 'application/pdf';
          const blob = new Blob([response.data], { type: contentType });
          const compressedFile = new File([blob], `compressed_${file.name}`, { type: contentType });

          compressedFiles.push(compressedFile);
        } catch (fileError) {
          console.error(`Failed to compress ${file.name}:`, fileError);
          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0 && compressedFiles.length === 0) {
        throw new Error(`Failed to compress all files: ${failedFiles.join(', ')}`);
      }

      if (failedFiles.length > 0) {
        setStatus(`Compressed ${compressedFiles.length}/${validFiles.length} files. Failed: ${failedFiles.join(', ')}`);
      }

      setFiles(compressedFiles);
      setIsGeneratingThumbnails(true);

      await addFiles(compressedFiles);

      cleanupBlobUrls();

      if (compressedFiles.length === 1) {
        const url = window.URL.createObjectURL(compressedFiles[0]);
        setDownloadUrl(url);
        setBlobUrls([url]);
        setDownloadFilename(`compressed_${selectedFiles[0].name}`);
      } else {
        const { zipFile } = await zipFileService.createZipFromFiles(compressedFiles, 'compressed_files.zip');
        const url = window.URL.createObjectURL(zipFile);
        setDownloadUrl(url);
        setBlobUrls([url]);
        setDownloadFilename(`compressed_${validFiles.length}_files.zip`);
      }

      const thumbnails = await Promise.all(
        compressedFiles.map(async (file) => {
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
      setStatus(t("downloadComplete"));
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
  }, [t, createOperation, buildFormData, recordOperation, markOperationApplied, markOperationFailed, addFiles]);

  const resetResults = useCallback(() => {
    cleanupBlobUrls();
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, [cleanupBlobUrls]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    executeOperation,
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
