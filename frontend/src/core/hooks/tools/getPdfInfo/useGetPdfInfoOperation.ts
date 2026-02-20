import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '@app/services/apiClient';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import type { StirlingFile } from '@app/types/fileContext';
import { extractErrorMessage } from '@app/utils/toolErrorHandler';
import {
  PdfInfoReportEntry,
  INFO_JSON_FILENAME,
} from '@app/types/getPdfInfo';
import type { GetPdfInfoParameters } from '@app/hooks/tools/getPdfInfo/useGetPdfInfoParameters';

export interface GetPdfInfoOperationHook extends ToolOperationHook<GetPdfInfoParameters> {
  results: PdfInfoReportEntry[];
}

export const useGetPdfInfoOperation = (): GetPdfInfoOperationHook => {
  const { t } = useTranslation();
  const { selectors } = useFileContext();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [results, setResults] = useState<PdfInfoReportEntry[]>([]);

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
    async (_params: GetPdfInfoParameters, selectedFiles: StirlingFile[]) => {
      if (selectedFiles.length === 0) {
        setErrorMessage(t('noFileSelected', 'No files selected'));
        return;
      }

      cancelRequested.current = false;
      setIsLoading(true);
      setStatus(t('getPdfInfo.processing', 'Extracting information...'));
      setErrorMessage(null);
      setResults([]);
      setFiles([]);
      cleanupDownloadUrl();
      setDownloadUrl(null);
      setDownloadFilename('');

      try {
        const aggregated: PdfInfoReportEntry[] = [];
        const generatedAt = Date.now();

        for (const file of selectedFiles) {
          if (cancelRequested.current) break;

          const formData = new FormData();
          formData.append('fileInput', file);

          try {
            const response = await apiClient.post('/api/v1/security/get-info-on-pdf', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            const stub = selectors.getStirlingFileStub(file.fileId);
            const entry: PdfInfoReportEntry = {
              fileId: file.fileId,
              fileName: file.name,
              fileSize: file.size ?? null,
              lastModified: file.lastModified ?? null,
              thumbnailUrl: stub?.thumbnailUrl ?? null,
              data: response.data ?? {},
              error: null,
              summaryGeneratedAt: generatedAt,
            };
            aggregated.push(entry);
          } catch (error) {
            const stub = selectors.getStirlingFileStub(file.fileId);
            aggregated.push({
              fileId: file.fileId,
              fileName: file.name,
              fileSize: file.size ?? null,
              lastModified: file.lastModified ?? null,
              thumbnailUrl: stub?.thumbnailUrl ?? null,
              data: {},
              error: extractErrorMessage(error),
              summaryGeneratedAt: generatedAt,
            });
          }
        }

        if (!cancelRequested.current) {
          setResults(aggregated);
          if (aggregated.length > 0) {
            // Build V1-compatible JSON: use backend payloads directly.
            const payloads = aggregated
              .filter((e) => !e.error)
              .map((e) => e.data);
            const content = payloads.length === 1 ? payloads[0] : payloads;
            const json = JSON.stringify(content, null, 2);
            const resultFile = new File([json], INFO_JSON_FILENAME, { type: 'application/json' });
            setFiles([resultFile]);
          }

          const anyError = aggregated.some((item) => item.error);
          if (anyError) {
            setErrorMessage(t('getPdfInfo.error.partial', 'Some files could not be processed.'));
          }
          setStatus(t('getPdfInfo.status.complete', 'Extraction complete'));
        }
      } catch (e) {
        console.error('[getPdfInfo] unexpected failure', e);
        setErrorMessage(t('getPdfInfo.error.unexpected', 'Unexpected error during extraction.'));
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

  return useMemo<GetPdfInfoOperationHook>(
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


