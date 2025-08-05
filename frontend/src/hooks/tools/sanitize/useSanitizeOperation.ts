import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SanitizeParameters } from './useSanitizeParameters';

export const useSanitizeOperation = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const executeOperation = useCallback(async (
    parameters: SanitizeParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      throw new Error(t('error.noFilesSelected', 'No files selected'));
    }

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
        throw new Error(t('sanitize.error', 'Sanitization failed: {{error}}', { error: errorText }));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(t('sanitize.completed', 'Sanitization completed successfully'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('sanitize.error.generic', 'Sanitization failed');
      setErrorMessage(message);
      setStatus(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const resetResults = useCallback(() => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    setDownloadUrl(null);
    setErrorMessage(null);
    setStatus(null);
  }, [downloadUrl]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    isLoading,
    errorMessage,
    downloadUrl,
    status,
    executeOperation,
    resetResults,
    clearError,
  };
};