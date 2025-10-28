import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ADDITION_HIGHLIGHT,
  CompareDiffToken,
  CompareFilteredTokenInfo,
  CompareResultData,
  CompareWorkerRequest,
  CompareWorkerResponse,
  CompareWorkerWarnings,
  REMOVAL_HIGHLIGHT,
} from '../../../types/compare';
import { CompareParameters } from './useCompareParameters';
import { ToolOperationHook } from '../shared/useToolOperation';
import type { StirlingFile } from '../../../types/fileContext';
import { useFileContext } from '../../../contexts/file/fileHooks';
import {
  aggregateTotals,
  buildChanges,
  createSummaryFile,
  extractContentFromPdf,
  getWorkerErrorCode,
  filterTokensForDiff,
} from './operationUtils';

export interface CompareOperationHook extends ToolOperationHook<CompareParameters> {
  result: CompareResultData | null;
  warnings: string[];
}

// extractContentFromPdf moved to utils

export const useCompareOperation = (): CompareOperationHook => {
  const { t } = useTranslation();
  const { selectors } = useFileContext();
  const workerRef = useRef<Worker | null>(null);
  const previousUrl = useRef<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [result, setResult] = useState<CompareResultData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../../../workers/compareWorker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return workerRef.current;
  }, []);

  const cleanupDownloadUrl = useCallback(() => {
    if (previousUrl.current) {
      URL.revokeObjectURL(previousUrl.current);
      previousUrl.current = null;
    }
  }, []);

  const resetResults = useCallback(() => {
    setResult(null);
    setWarnings([]);
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

  const runCompareWorker = useCallback(
    async (baseTokens: string[], comparisonTokens: string[], warningMessages: CompareWorkerWarnings) => {
      const worker = ensureWorker();

      return await new Promise<{
        tokens: CompareDiffToken[];
        stats: { baseWordCount: number; comparisonWordCount: number; durationMs: number };
        warnings: string[];
      }>((resolve, reject) => {
        const collectedWarnings: string[] = [];

        const handleMessage = (event: MessageEvent<CompareWorkerResponse>) => {
          const message = event.data;
          if (!message) {
            return;
          }

          switch (message.type) {
            case 'success':
              cleanup();
              resolve({
                tokens: message.tokens,
                stats: message.stats,
                warnings: collectedWarnings,
              });
              break;
            case 'warning':
              collectedWarnings.push(message.message);
              break;
            case 'error': {
              cleanup();
              const error: Error & { code?: 'EMPTY_TEXT' | 'TOO_LARGE' } = new Error(message.message);
              error.code = message.code;
              reject(error);
              break;
            }
            default:
              break;
          }
        };

        const handleError = (event: ErrorEvent) => {
          cleanup();
          reject(event.error ?? new Error(event.message));
        };

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage as EventListener);
          worker.removeEventListener('error', handleError as EventListener);
        };

        worker.addEventListener('message', handleMessage as EventListener);
        worker.addEventListener('error', handleError as EventListener);

        const request: CompareWorkerRequest = {
          type: 'compare',
          payload: {
            baseTokens,
            comparisonTokens,
            warnings: warningMessages,
            // Static worker settings to support large documents
            settings: {
              batchSize: 5000,
              complexThreshold: 120000,
              maxWordThreshold: 200000,
            },
          },
        };

        worker.postMessage(request);
      });
    },
    [ensureWorker]
  );

  const executeOperation = useCallback(
    async (params: CompareParameters, selectedFiles: StirlingFile[]) => {
      if (!params.baseFileId || !params.comparisonFileId) {
        setErrorMessage(t('compare.error.selectRequired', 'Select a base and comparison document.'));
        return;
      }

      const baseFile = selectedFiles.find((file) => file.fileId === params.baseFileId)
        ?? selectors.getFile(params.baseFileId);
      const comparisonFile = selectedFiles.find((file) => file.fileId === params.comparisonFileId)
        ?? selectors.getFile(params.comparisonFileId);

      if (!baseFile || !comparisonFile) {
        setErrorMessage(t('compare.error.filesMissing', 'Unable to locate the selected files. Please re-select them.'));
        return;
      }

      setIsLoading(true);
      setStatus(t('compare.status.extracting', 'Extracting text...'));
      setErrorMessage(null);
      setWarnings([]);
      setResult(null);
      setFiles([]);
      cleanupDownloadUrl();
      setDownloadUrl(null);
      setDownloadFilename('');

      const warningMessages: CompareWorkerWarnings = {
        // No accuracy warning any more
        tooLargeMessage: t(
          'compare.large.file.message',
          'These documents are very large; comparison may take several minutes. Please keep this tab open.'
        ),
        emptyTextMessage: t(
          'compare.no.text.message',
          'One or both of the selected PDFs have no text content. Please choose PDFs with text for comparison.'
        ),
      };

      const operationStart = performance.now();

      try {
        const [baseContent, comparisonContent] = await Promise.all([
          extractContentFromPdf(baseFile),
          extractContentFromPdf(comparisonFile),
        ]);

        if (baseContent.tokens.length === 0 || comparisonContent.tokens.length === 0) {
          throw Object.assign(new Error(warningMessages.emptyTextMessage), { code: 'EMPTY_TEXT' });
        }

        setStatus(t('compare.status.processing', 'Analyzing differences...'));

        // Filter out paragraph sentinels before diffing to avoid large false-positive runs
        const baseFiltered = filterTokensForDiff(baseContent.tokens, baseContent.metadata);
        const comparisonFiltered = filterTokensForDiff(comparisonContent.tokens, comparisonContent.metadata);

        const { tokens, stats, warnings: workerWarnings } = await runCompareWorker(
          baseFiltered.tokens,
          comparisonFiltered.tokens,
          warningMessages
        );

        const baseHasHighlight = new Array<boolean>(baseFiltered.tokens.length).fill(false);
        const comparisonHasHighlight = new Array<boolean>(comparisonFiltered.tokens.length).fill(false);

        let baseTokenPointer = 0;
        let comparisonTokenPointer = 0;
        for (const diffToken of tokens) {
          if (diffToken.type === 'removed') {
            if (baseTokenPointer < baseHasHighlight.length) {
              baseHasHighlight[baseTokenPointer] = true;
            }
            baseTokenPointer += 1;
          } else if (diffToken.type === 'added') {
            if (comparisonTokenPointer < comparisonHasHighlight.length) {
              comparisonHasHighlight[comparisonTokenPointer] = true;
            }
            comparisonTokenPointer += 1;
          } else {
            if (baseTokenPointer < baseHasHighlight.length) {
              baseTokenPointer += 1;
            }
            if (comparisonTokenPointer < comparisonHasHighlight.length) {
              comparisonTokenPointer += 1;
            }
          }
        }

        const buildFilteredTokenData = (
          tokensList: typeof baseFiltered.tokens,
          metadataList: typeof baseFiltered.metadata,
          highlightFlags: boolean[]
        ): CompareFilteredTokenInfo[] =>
          tokensList.map((token, index) => {
            const meta = metadataList[index];
            return {
              token,
              page: meta?.page ?? null,
              paragraph: meta?.paragraph ?? null,
              bbox: meta?.bbox ?? null,
              hasHighlight: highlightFlags[index] ?? false,
              metaIndex: index,
            };
          });

        const totals = aggregateTotals(tokens);
        const processedAt = Date.now();

        const baseMetadata = baseFiltered.metadata;
        const comparisonMetadata = comparisonFiltered.metadata;

        const changes = buildChanges(tokens, baseMetadata, comparisonMetadata);

        const comparisonResult: CompareResultData = {
          base: {
            fileId: baseFile.fileId,
            fileName: baseFile.name,
            highlightColor: REMOVAL_HIGHLIGHT,
            wordCount: stats.baseWordCount,
            pageSizes: baseContent.pageSizes,
          },
          comparison: {
            fileId: comparisonFile.fileId,
            fileName: comparisonFile.name,
            highlightColor: ADDITION_HIGHLIGHT,
            wordCount: stats.comparisonWordCount,
            pageSizes: comparisonContent.pageSizes,
          },
          totals: {
            ...totals,
            durationMs: stats.durationMs,
            processedAt,
          },
          tokens,
          tokenMetadata: {
            base: baseMetadata,
            comparison: comparisonMetadata,
          },
          filteredTokenData: {
            base: buildFilteredTokenData(baseFiltered.tokens, baseFiltered.metadata, baseHasHighlight),
            comparison: buildFilteredTokenData(
              comparisonFiltered.tokens,
              comparisonFiltered.metadata,
              comparisonHasHighlight
            ),
          },
          sourceTokens: {
            base: baseContent.tokens,
            comparison: comparisonContent.tokens,
          },
          changes,
          warnings: workerWarnings,
          baseParagraphs: baseContent.paragraphs,
          comparisonParagraphs: comparisonContent.paragraphs,
        };

        setResult(comparisonResult);
        setWarnings(workerWarnings);

        const summaryFile = createSummaryFile(comparisonResult);
        setFiles([summaryFile]);

        cleanupDownloadUrl();
        const blobUrl = URL.createObjectURL(summaryFile);
        previousUrl.current = blobUrl;
        setDownloadUrl(blobUrl);
        setDownloadFilename(summaryFile.name);

        setStatus(t('compare.status.complete', 'Comparison ready'));
      } catch (error: unknown) {
        console.error('[compare] operation failed', error);
        const errorCode = getWorkerErrorCode(error);
        if (errorCode === 'EMPTY_TEXT') {
          setErrorMessage(warningMessages.emptyTextMessage ?? t('compare.error.generic', 'Unable to compare these files.'));
        } else {
          const fallbackMessage = t('compare.error.generic', 'Unable to compare these files.');
          if (error instanceof Error && error.message) {
            setErrorMessage(error.message);
          } else if (typeof error === 'string' && error.trim().length > 0) {
            setErrorMessage(error);
          } else {
            setErrorMessage(fallbackMessage);
          }
        }
      } finally {
        const duration = performance.now() - operationStart;
        setStatus((prev) => (prev ? `${prev} (${Math.round(duration)} ms)` : prev));
        setIsLoading(false);
      }
    },
    [cleanupDownloadUrl, runCompareWorker, selectors, t]
  );

  const cancelOperation = useCallback(() => {
    if (isLoading) {
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
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [cleanupDownloadUrl]);

  return useMemo<CompareOperationHook>(
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
      executeOperation,
      resetResults,
      clearError,
      cancelOperation,
      undoOperation,
      result,
      warnings,
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
      result,
      status,
      undoOperation,
      warnings,
    ]
  );
};
