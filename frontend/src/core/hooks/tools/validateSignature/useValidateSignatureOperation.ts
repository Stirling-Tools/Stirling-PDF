import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import type { StirlingFile } from '@app/types/fileContext';
import { extractErrorMessage } from '@app/utils/toolErrorHandler';
import {
  SignatureValidationBackendResult,
  SignatureValidationFileResult,
  SignatureValidationReportEntry,
} from '@app/types/validateSignature';
import { ValidateSignatureParameters } from '@app/hooks/tools/validateSignature/useValidateSignatureParameters';
import { buildReportEntries } from '@app/hooks/tools/validateSignature/utils/signatureReportBuilder';
import { createReportPdf } from '@app/hooks/tools/validateSignature/signatureReportPdf';
import { createCsvFile as buildCsvFile } from '@app/hooks/tools/validateSignature/utils/signatureCsv';
import { normalizeBackendResult, RESULT_JSON_FILENAME } from '@app/hooks/tools/validateSignature/utils/signatureUtils';

export interface ValidateSignatureOperationHook extends ToolOperationHook<ValidateSignatureParameters> {
  results: SignatureValidationReportEntry[];
}

export const useValidateSignatureOperation = (): ValidateSignatureOperationHook => {
  const { t } = useTranslation();
  const { selectors } = useFileContext();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [results, setResults] = useState<SignatureValidationReportEntry[]>([]);

  const cancelRequested = useRef(false);
  const previousUrl = useRef<string | null>(null);

  const cleanupDownloadUrl = useCallback(() => {
    if (previousUrl.current) {
      URL.revokeObjectURL(previousUrl.current);
      previousUrl.current = null;
    }
  }, []);

  const resetResults = useCallback(() => {
    cancelRequested.current = false;
    setResults([]);
    setFiles([]);
    cleanupDownloadUrl();
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
  }, [cleanupDownloadUrl]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const executeOperation = useCallback(
    async (params: ValidateSignatureParameters, selectedFiles: StirlingFile[]) => {
      if (selectedFiles.length === 0) {
        setErrorMessage(t('noFileSelected', 'No files selected'));
        return;
      }

      cancelRequested.current = false;
      setIsLoading(true);
      setStatus(t('validateSignature.processing', 'Validating signatures...'));
      setErrorMessage(null);
      setResults([]);
      setFiles([]);
      cleanupDownloadUrl();
      setDownloadUrl(null);
      setDownloadFilename('');

      try {
        const aggregated: SignatureValidationFileResult[] = [];

        for (const file of selectedFiles) {
          if (cancelRequested.current) {
            break;
          }

          const formData = new FormData();
          formData.append('fileInput', file);
          if (params.certFile) {
            formData.append('certFile', params.certFile);
          }

          try {
            const response = await apiClient.post('/api/v1/security/validate-signature', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            const data = Array.isArray(response.data)
              ? (response.data as SignatureValidationBackendResult[])
              : [];
            const signatures = data.map((item, index) => normalizeBackendResult(item, file, index));

            aggregated.push({
              fileId: file.fileId,
              fileName: file.name,
              signatures,
              error: null,
              fileSize: file.size ?? null,
              lastModified: file.lastModified ?? null,
            });
          } catch (error) {
            aggregated.push({
              fileId: file.fileId,
              fileName: file.name,
              signatures: [],
              error: extractErrorMessage(error),
              fileSize: file.size ?? null,
              lastModified: file.lastModified ?? null,
            });
          }
        }

        if (!cancelRequested.current) {
          const summaryTimestamp = Date.now();
          const enrichedEntries = buildReportEntries({
            results: aggregated,
            selectors,
            generatedAt: summaryTimestamp,
            t,
          });

          setResults(enrichedEntries);

          if (enrichedEntries.length > 0) {
            const json = JSON.stringify(enrichedEntries, null, 2);
            const resultFile = new File([json], RESULT_JSON_FILENAME, { type: 'application/json' });
            const csvFile = buildCsvFile(enrichedEntries);

            setFiles([resultFile, csvFile]);

            (async () => {
              try {
                const pdfFile = await createReportPdf(enrichedEntries, t);
                setFiles((prev) => [pdfFile, ...prev.filter((f) => !f.name.toLowerCase().endsWith('.pdf'))]);
                setDownloadFilename(pdfFile.name);
                cleanupDownloadUrl();
                const blobUrl = URL.createObjectURL(pdfFile);
                previousUrl.current = blobUrl;
                setDownloadUrl(blobUrl);
              } catch (err) {
                console.warn('[validateSignature] PDF report generation failed', err);
                setErrorMessage((prev) =>
                  prev ??
                  t(
                    'validateSignature.error.reportGeneration',
                    'Could not generate the PDF report. JSON and CSV are available.'
                  )
                );
              }
            })();
          }

          const anyError = aggregated.some((item) => item.error);
          const anySuccess = aggregated.some((item) => item.signatures.length > 0);

          if (anyError && !anySuccess) {
            setErrorMessage(t('validateSignature.error.allFailed', 'Unable to validate the selected files.'));
          } else if (anyError) {
            setErrorMessage(t('validateSignature.error.partial', 'Some files could not be validated.'));
          }

          setStatus(t('validateSignature.status.complete', 'Validation complete'));
        }
      } catch (e) {
        console.error('[validateSignature] unexpected failure', e);
        setErrorMessage(t('validateSignature.error.unexpected', 'Unexpected error during validation.'));
      } finally {
        setIsLoading(false);
      }
    },
    [cleanupDownloadUrl, selectors, t]
  );

  const cancelOperation = useCallback(() => {
    if (isLoading) {
      cancelRequested.current = true;
      setIsLoading(false);
      setStatus(t('operationCancelled', 'Operation cancelled'));
    }
  }, [isLoading, t]);

  const undoOperation = useCallback(async () => {
    resetResults();
  }, [resetResults]);

  useEffect(() => {
    return () => {
      cleanupDownloadUrl();
    };
  }, [cleanupDownloadUrl]);

  return useMemo<ValidateSignatureOperationHook>(
    () => ({
      files,
      thumbnails: [],
      isGeneratingThumbnails: false,
      downloadUrl,
      downloadFilename,
      isLoading,
      status,
      errorMessage,
      progress: null,
      willUseCloud: false,
      executeOperation,
      resetResults,
      clearError,
      cancelOperation,
      undoOperation,
      results,
    }),
    [
      cancelOperation,
      clearError,
      downloadFilename,
      downloadUrl,
      errorMessage,
      executeOperation,
      files,
      isLoading,
      resetResults,
      results,
      status,
    ]
  );
};
