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
} from '@app/types/compare';
import { CompareParameters } from '@app/hooks/tools/compare/useCompareParameters';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import type { StirlingFile } from '@app/types/fileContext';
import { useFileContext } from '@app/contexts/file/fileHooks';
import {
  aggregateTotals,
  buildChanges,
  createSummaryFile,
  extractContentFromPdf,
  getWorkerErrorCode,
  filterTokensForDiff,
} from '@app/hooks/tools/compare/operationUtils';
import { alert, dismissToast } from '@app/components/toast';
import type { ToastLocation } from '@app/components/toast/types';
import CompareWorkerCtor from '@app/workers/compareWorker?worker';
const LONG_RUNNING_PAGE_THRESHOLD = 2000;

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
  const activeRunIdRef = useRef(0);
  const cancelledRef = useRef(false);

  type OperationStatus = 'idle' | 'extracting' | 'processing' | 'complete' | 'cancelled' | 'error';
  const [isLoading, setIsLoading] = useState(false);
  const [statusState, setStatusState] = useState<OperationStatus>('idle');
  const [statusDetailMs, setStatusDetailMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [result, setResult] = useState<CompareResultData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const longRunningToastIdRef = useRef<string | null>(null);
  const dissimilarityToastIdRef = useRef<string | null>(null);
  const dissimilarityToastShownRef = useRef<boolean>(false);

  const ensureWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new CompareWorkerCtor();
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
    setStatusState('idle');
    setStatusDetailMs(null);
    setErrorMessage(null);
  }, [cleanupDownloadUrl]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const runCompareWorker = useCallback(
    async (baseTokens: string[], comparisonTokens: string[], warningMessages: CompareWorkerWarnings, onChunk?: (chunk: CompareDiffToken[]) => void) => {
      const worker = ensureWorker();

      return await new Promise<{
        tokens: CompareDiffToken[];
        stats: { baseWordCount: number; comparisonWordCount: number; durationMs: number };
        warnings: string[];
      }>((resolve, reject) => {
        const collectedWarnings: string[] = [];
        const collectedTokens: CompareDiffToken[] = [];

        const handleMessage = (event: MessageEvent<CompareWorkerResponse>) => {
          if (cancelledRef.current) {
            cleanup();
            reject(Object.assign(new Error('Operation cancelled'), { code: 'CANCELLED' as const }));
            return;
          }
          const message = event.data;
          if (!message) {
            return;
          }

          switch (message.type) {
            case 'chunk': {
              if (message.tokens.length > 0) {
                collectedTokens.push(...message.tokens);
                onChunk?.(message.tokens);
              }
              break;
            }
            case 'success':
              cleanup();
              if (longRunningToastIdRef.current) {
                dismissToast(longRunningToastIdRef.current);
                longRunningToastIdRef.current = null;
              }
              resolve({
                tokens: collectedTokens,
                stats: message.stats,
                warnings: collectedWarnings,
              });
              break;
            case 'warning':
              collectedWarnings.push(message.message);
              break;
            case 'error': {
              cleanup();
              if (longRunningToastIdRef.current) {
                dismissToast(longRunningToastIdRef.current);
                longRunningToastIdRef.current = null;
              }
              const error: Error & { code?: 'EMPTY_TEXT' | 'TOO_LARGE' | 'TOO_DISSIMILAR' } = new Error(message.message);
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
          if (cancelledRef.current) {
            reject(Object.assign(new Error('Operation cancelled'), { code: 'CANCELLED' as const }));
          } else {
            reject(event.error ?? new Error(event.message));
          }
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
      // start new run
      const runId = ++activeRunIdRef.current;
      cancelledRef.current = false;
      if (!params.baseFileId || !params.comparisonFileId) {
        setErrorMessage(t('compare.error.selectRequired', 'Select the original and edited document.'));
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
      setStatusState('extracting');
      setStatusDetailMs(null);
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
        tooDissimilarMessage: t(
          'compare.too.dissimilar.message',
          'These documents appear highly dissimilar. Comparison was stopped to save time.'
        ),
      };

      const operationStart = performance.now();

      try {
        const [baseContent, comparisonContent] = await Promise.all([
          extractContentFromPdf(baseFile),
          extractContentFromPdf(comparisonFile),
        ]);

        if (cancelledRef.current || activeRunIdRef.current !== runId) return;

        if (baseContent.tokens.length === 0 || comparisonContent.tokens.length === 0) {
          throw Object.assign(new Error(warningMessages.emptyTextMessage), { code: 'EMPTY_TEXT' });
        }

        setStatusState('processing');

        // Filter out paragraph sentinels before diffing to avoid large false-positive runs
        const baseFiltered = filterTokensForDiff(baseContent.tokens, baseContent.metadata);
        const comparisonFiltered = filterTokensForDiff(comparisonContent.tokens, comparisonContent.metadata);

        const combinedPageCount =
          (baseContent.pageSizes?.length ?? 0) + (comparisonContent.pageSizes?.length ?? 0);

        if (
          combinedPageCount >= LONG_RUNNING_PAGE_THRESHOLD &&
          !longRunningToastIdRef.current
        ) {
          const toastId = alert({
            alertType: 'neutral',
            title: t('compare.longJob.title', 'Large comparison in progress'),
            body: t(
              'compare.longJob.body',
              'These PDFs together exceed 2,000 pages. Processing can take several minutes.'
            ),
            location: 'bottom-right' as ToastLocation,
            isPersistentPopup: true,
            expandable: false,
          });
          longRunningToastIdRef.current = toastId || null;
        }

        // Heuristic: surface an early warning toast when we observe a very high ratio of differences
        const EARLY_TOAST_MIN_TOKENS = 15000; // wait for some signal before warning
        const EARLY_TOAST_DIFF_RATIO = 0.8;   // 80% added/removed vs unchanged
        let observedAddedRemoved = 0;
        let observedUnchanged = 0;

        const handleEarlyDissimilarity = () => {
          if (dissimilarityToastShownRef.current || dissimilarityToastIdRef.current) return;
          const toastId = alert({
            alertType: 'warning',
            title: t('compare.earlyDissimilarity.title', 'These PDFs look highly different'),
            body: t(
              'compare.earlyDissimilarity.body',
              "We're seeing very few similarities so far. You can stop the comparison if these aren't related documents."
            ),
            location: 'bottom-right' as ToastLocation,
            isPersistentPopup: true,
            expandable: false,
            buttonText: t('compare.earlyDissimilarity.stopButton', 'Stop comparison'),
            buttonCallback: () => {
              try { cancelOperation(); } catch {
                console.error('Failed to cancel operation');
              }
              try { window.dispatchEvent(new CustomEvent('compare:clear-selected')); } catch {
                console.error('Failed to dispatch clear selected event');
              }
              if (dissimilarityToastIdRef.current) {
                dismissToast(dissimilarityToastIdRef.current);
                dissimilarityToastIdRef.current = null;
              }
            },
          });
          dissimilarityToastIdRef.current = toastId || null;
          dissimilarityToastShownRef.current = true;
        };

        const { tokens, stats, warnings: workerWarnings } = await runCompareWorker(
          baseFiltered.tokens,
          comparisonFiltered.tokens,
          warningMessages,
          (chunk) => {
            // Incremental ratio tracking for early warning
            for (const tok of chunk) {
              if (tok.type === 'unchanged') observedUnchanged += 1;
              else observedAddedRemoved += 1;
            }
            const seen = observedAddedRemoved + observedUnchanged;
            if (
              !dissimilarityToastShownRef.current &&
              seen >= EARLY_TOAST_MIN_TOKENS &&
              observedAddedRemoved / Math.max(1, seen) >= EARLY_TOAST_DIFF_RATIO
            ) {
              handleEarlyDissimilarity();
            }
          }
        );

        if (cancelledRef.current || activeRunIdRef.current !== runId) return;

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

        setStatusState('complete');
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
        setStatusDetailMs(Math.round(duration));
        setIsLoading(false);
        if (longRunningToastIdRef.current) {
          dismissToast(longRunningToastIdRef.current);
          longRunningToastIdRef.current = null;
        }
        if (dissimilarityToastIdRef.current) {
          dismissToast(dissimilarityToastIdRef.current);
          dissimilarityToastIdRef.current = null;
        }
        dissimilarityToastShownRef.current = false;
      }
    },
    [cleanupDownloadUrl, runCompareWorker, selectors, t]
  );

  const cancelOperation = useCallback(() => {
    if (!isLoading) return;
    cancelledRef.current = true;
    setIsLoading(false);
    setStatusState('cancelled');
    if (workerRef.current) {
      try {
        workerRef.current.terminate();
      // eslint-disable-next-line no-empty
      } catch {}
      workerRef.current = null;
    }
    if (longRunningToastIdRef.current) {
      dismissToast(longRunningToastIdRef.current);
      longRunningToastIdRef.current = null;
    }
  }, [isLoading]);

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
      if (longRunningToastIdRef.current) {
        dismissToast(longRunningToastIdRef.current);
        longRunningToastIdRef.current = null;
      }
    };
  }, [cleanupDownloadUrl]);

  const status = useMemo(() => {
    const label =
      statusState === 'idle' ? ''
        : statusState === 'extracting' ? t('compare.status.extracting', 'Extracting text...')
        : statusState === 'processing' ? t('compare.status.processing', 'Analyzing differences...')
        : statusState === 'complete' ? t('compare.status.complete', 'Comparison ready')
        : statusState === 'cancelled' ? t('operationCancelled', 'Operation cancelled')
        : '';
    if (label && statusDetailMs != null) return `${label} (${statusDetailMs} ms)`;
    return label;
  }, [statusState, statusDetailMs, t]);

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
