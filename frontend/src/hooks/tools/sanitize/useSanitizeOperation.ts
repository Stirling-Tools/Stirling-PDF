import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { zipFileService } from '../../../services/zipFileService';
import { SanitizeParameters } from './useSanitizeParameters';

export const useSanitizeOperation = () => {
  const { t } = useTranslation();
  const {
    recordOperation,
    markOperationApplied,
    markOperationFailed,
    addFiles
  } = useFileContext();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [status, setStatus] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);

  const createOperation = useCallback((
    parameters: SanitizeParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `sanitize-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles[0].name;

    const operation: FileOperation = {
      id: operationId,
      type: 'sanitize',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0].name,
        parameters: {
          removeJavaScript: parameters.removeJavaScript,
          removeEmbeddedFiles: parameters.removeEmbeddedFiles,
          removeXMPMetadata: parameters.removeXMPMetadata,
          removeMetadata: parameters.removeMetadata,
          removeLinks: parameters.removeLinks,
          removeFonts: parameters.removeFonts,
        },
        fileSize: selectedFiles[0].size
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const buildFormData = useCallback((parameters: SanitizeParameters, file: File): FormData => {
    const formData = new FormData();
    formData.append('fileInput', file);

    // Add parameters
    formData.append('removeJavaScript', parameters.removeJavaScript.toString());
    formData.append('removeEmbeddedFiles', parameters.removeEmbeddedFiles.toString());
    formData.append('removeXMPMetadata', parameters.removeXMPMetadata.toString());
    formData.append('removeMetadata', parameters.removeMetadata.toString());
    formData.append('removeLinks', parameters.removeLinks.toString());
    formData.append('removeFonts', parameters.removeFonts.toString());

    return formData;
  }, []);

  const generateSanitizedFileName = (originalFileName: string): string => {
    const baseName = originalFileName.replace(/\.[^/.]+$/, '');
    const prefix = t('sanitize.filenamePrefix', 'sanitized');
    return `${prefix}_${baseName}.pdf`;
  };

  const sanitizeFile = useCallback(async (
    file: File,
    parameters: SanitizeParameters,
    operationId: string,
    fileId: string
  ): Promise<File | null> => {
    try {
      const formData = buildFormData(parameters, file);

      const response = await fetch('/api/v1/security/sanitize-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        markOperationFailed(fileId, operationId, errorText);
        console.error(`Error sanitizing file ${file.name}:`, errorText);
        return null;
      }

      const blob = await response.blob();
      const sanitizedFileName = generateSanitizedFileName(file.name);
      const sanitizedFile = new File([blob], sanitizedFileName, { type: blob.type });

      markOperationApplied(fileId, operationId);
      return sanitizedFile;
    } catch (error) {
      console.error(`Error sanitizing file ${file.name}:`, error);
      markOperationFailed(fileId, operationId, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }, [buildFormData, markOperationApplied, markOperationFailed]);

  const createDownloadInfo = useCallback(async (results: File[]): Promise<void> => {
    if (results.length === 1) {
      const url = window.URL.createObjectURL(results[0]);
      setDownloadUrl(url);
      setDownloadFilename(results[0].name);
    } else {
      const zipFilename = `${t('sanitize.filenamePrefix', 'sanitized')}_files.zip`;
      const { zipFile } = await zipFileService.createZipFromFiles(results, zipFilename);
      const url = window.URL.createObjectURL(zipFile);
      setDownloadUrl(url);
      setDownloadFilename(zipFilename);
    }
  }, [t]);

  const generateThumbnailsForResults = useCallback(async (results: File[]): Promise<void> => {
    const thumbnails = await Promise.all(
      results.map(async (file) => {
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
  }, []);

  const processResults = useCallback(async (results: File[]): Promise<void> => {
    setFiles(results);
    setIsGeneratingThumbnails(true);

    // Add sanitized files to FileContext for future use
    await addFiles(results);

    // Create download info - single file or ZIP
    await createDownloadInfo(results);

    // Generate thumbnails
    await generateThumbnailsForResults(results);

    setIsGeneratingThumbnails(false);
    setStatus(results.length === 1
      ? t('sanitize.completed', 'Sanitization completed successfully')
      : t('sanitize.completedMultiple', 'Sanitized {{count}} files successfully', { count: results.length })
    );
  }, [addFiles, createDownloadInfo, generateThumbnailsForResults, t]);

  const executeOperation = useCallback(async (
    parameters: SanitizeParameters,
    selectedFiles: File[],
  ) => {
    if (selectedFiles.length === 0) {
      throw new Error(t('error.noFilesSelected', 'No files selected'));
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatus(selectedFiles.length === 1
      ? t('sanitize.processing', 'Sanitizing PDF...')
      : t('sanitize.processingMultiple', 'Sanitizing {{count}} PDFs...', { count: selectedFiles.length })
    );

    const results: File[] = [];
    const failedFiles: string[] = [];

    try {
      // Process each file separately
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const { operation, operationId, fileId } = createOperation(parameters, [file]);
        recordOperation(fileId, operation);

        setStatus(selectedFiles.length === 1
          ? t('sanitize.processing', 'Sanitizing PDF...')
          : t('sanitize.processingFile', 'Processing file {{current}} of {{total}}: {{filename}}', {
              current: i + 1,
              total: selectedFiles.length,
              filename: file.name
            })
        );

        const sanitizedFile = await sanitizeFile(file, parameters, operationId, fileId);

        if (sanitizedFile) {
          results.push(sanitizedFile);
        } else {
          failedFiles.push(file.name);
        }
      }

      if (failedFiles.length > 0 && results.length === 0) {
        throw new Error(`Failed to sanitize all files: ${failedFiles.join(', ')}`);
      }

      if (failedFiles.length > 0) {
        setStatus(`Sanitized ${results.length}/${selectedFiles.length} files. Failed: ${failedFiles.join(', ')}`);
      }

      if (results.length > 0) {
        await processResults(results);
      } else {
        setErrorMessage(t('sanitize.errorAllFilesFailed', 'All files failed to sanitize'));
      }
    } catch (error) {
      console.error('Error in sanitization operation:', error);
      const message = error instanceof Error ? error.message : t('sanitize.error.generic', 'Sanitization failed');
      setErrorMessage(message);
      setStatus(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [t, createOperation, recordOperation, sanitizeFile, processResults]);

  const resetResults = useCallback(() => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setDownloadFilename('');
    setErrorMessage(null);
    setStatus(null);
  }, [downloadUrl]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  return {
    isLoading,
    errorMessage,
    downloadUrl,
    downloadFilename,
    status,
    files,
    thumbnails,
    isGeneratingThumbnails,
    executeOperation,
    resetResults,
    clearError,
  };
};
