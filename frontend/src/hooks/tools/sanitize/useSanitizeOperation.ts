import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
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

  const processResults = useCallback(async (blob: Blob, filename: string) => {
    try {
      // Create sanitized file
      const sanitizedFile = new File([blob], filename, { type: blob.type });

      // Set local state for preview
      setFiles([sanitizedFile]);
      setThumbnails([]);
      setIsGeneratingThumbnails(true);

      // Add sanitized file to FileContext for future use
      await addFiles([sanitizedFile]);

      // Generate thumbnail for preview
      try {
        const thumbnail = await generateThumbnailForFile(sanitizedFile);
        if (thumbnail) {
          setThumbnails([thumbnail]);
        }
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${filename}:`, error);
        setThumbnails(['']);
      }

      setIsGeneratingThumbnails(false);
    } catch (error) {
      console.warn('Failed to process sanitization result:', error);
    }
  }, [addFiles]);

  const executeOperation = useCallback(async (
    parameters: SanitizeParameters,
    selectedFiles: File[],
    generateSanitizedFileName: (originalFileName?: string) => string
  ) => {
    if (selectedFiles.length === 0) {
      throw new Error(t('error.noFilesSelected', 'No files selected'));
    }

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);
    recordOperation(fileId, operation);

    setIsLoading(true);
    setErrorMessage(null);
    setStatus(t('sanitize.processing', 'Sanitizing PDF...'));

    try {
      const formData = new FormData();
      formData.append('fileInput', selectedFiles[0]);

      // Add parameters
      formData.append('removeJavaScript', parameters.removeJavaScript.toString());
      formData.append('removeEmbeddedFiles', parameters.removeEmbeddedFiles.toString());
      formData.append('removeXMPMetadata', parameters.removeXMPMetadata.toString());
      formData.append('removeMetadata', parameters.removeMetadata.toString());
      formData.append('removeLinks', parameters.removeLinks.toString());
      formData.append('removeFonts', parameters.removeFonts.toString());

      const response = await fetch('/api/v1/security/sanitize-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        markOperationFailed(fileId, operationId, errorText);
        throw new Error(t('sanitize.error', 'Sanitization failed: {{error}}', { error: errorText }));
      }

      const blob = await response.blob();
      const sanitizedFileName = generateSanitizedFileName(selectedFiles[0].name);

      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(t('sanitize.completed', 'Sanitization completed successfully'));

      // Process results and add to workbench
      await processResults(blob, sanitizedFileName);
      markOperationApplied(fileId, operationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('sanitize.error.generic', 'Sanitization failed');
      setErrorMessage(message);
      setStatus(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [t, createOperation, recordOperation, markOperationApplied, markOperationFailed, processResults]);

  const resetResults = useCallback(() => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
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
    status,
    files,
    thumbnails,
    isGeneratingThumbnails,
    executeOperation,
    resetResults,
    clearError,
  };
};
