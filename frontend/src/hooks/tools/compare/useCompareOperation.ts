import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appendWord as sharedAppendWord } from '../../../utils/textDiff';
import { pdfWorkerManager } from '../../../services/pdfWorkerManager';
import {
  ADDITION_HIGHLIGHT,
  CompareChange,
  CompareDiffToken,
  CompareResultData,
  CompareWorkerRequest,
  CompareWorkerResponse,
  CompareWorkerWarnings,
  REMOVAL_HIGHLIGHT,
  PARAGRAPH_SENTINEL,
} from '../../../types/compare';
import { CompareParameters } from './useCompareParameters';
import { ToolOperationHook } from '../shared/useToolOperation';
import type { StirlingFile } from '../../../types/fileContext';
import { useFileContext } from '../../../contexts/file/fileHooks';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { TokenBoundingBox } from '../../../types/compare';
import type { CompareParagraph } from '../../../types/compare';

interface TokenMetadata {
  page: number;
  paragraph: number;
  bbox: TokenBoundingBox | null;
}

interface ExtractedContent {
  tokens: string[];
  metadata: TokenMetadata[];
  pageSizes: { width: number; height: number }[];
  paragraphs: CompareParagraph[];
}

const measurementCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measurementContext = measurementCanvas ? measurementCanvas.getContext('2d') : null;
const textMeasurementCache: Map<string, number> | null = measurementContext ? new Map() : null;
let lastMeasurementFont = '';

const DEFAULT_CHAR_WIDTH = 1;
const DEFAULT_SPACE_WIDTH = 0.33;

const measureTextWidth = (fontSpec: string, text: string): number => {
  if (!measurementContext) {
    if (!text) return 0;
    if (text === ' ') return DEFAULT_SPACE_WIDTH;
    return text.length * DEFAULT_CHAR_WIDTH;
  }

  if (lastMeasurementFont !== fontSpec) {
    measurementContext.font = fontSpec;
    lastMeasurementFont = fontSpec;
  }

  const key = `${fontSpec}|${text}`;
  const cached = textMeasurementCache?.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const width = measurementContext.measureText(text).width || 0;
  textMeasurementCache?.set(key, width);
  return width;
};

export interface CompareOperationHook extends ToolOperationHook<CompareParameters> {
  result: CompareResultData | null;
  warnings: string[];
}

const DEFAULT_WORKER_SETTINGS = {
  batchSize: 6000,
  complexThreshold: 120000,
  maxWordThreshold: 200000,
};

const aggregateTotals = (tokens: CompareDiffToken[]) => {
  return tokens.reduce(
    (totals, token) => {
      if (token.text === PARAGRAPH_SENTINEL) {
        return totals;
      }
      switch (token.type) {
        case 'added':
          totals.added += 1;
          break;
        case 'removed':
          totals.removed += 1;
          break;
        default:
          totals.unchanged += 1;
      }
      return totals;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
};

const shouldConcatWithoutSpace = (word: string) => {
  return /^[.,!?;:)\]\}]/.test(word) || word.startsWith("'") || word === "'s";
};

const appendWord = (existing: string, word: string) => {
  if (!existing) {
    return sharedAppendWord('', word);
  }
  return sharedAppendWord(existing, word);
};

const buildChanges = (
  tokens: CompareDiffToken[],
  baseMetadata: TokenMetadata[],
  comparisonMetadata: TokenMetadata[]
): CompareChange[] => {
  const changes: CompareChange[] = [];
  let baseIndex = 0;
  let comparisonIndex = 0;
  let current: CompareChange | null = null;
  let currentBaseParagraph: number | null = null;
  let currentComparisonParagraph: number | null = null;

  const ensureCurrent = (): CompareChange => {
    if (!current) {
      current = {
        id: `change-${changes.length}`,
        base: null,
        comparison: null,
      };
    }
    return current;
  };

  const flush = () => {
    if (current) {
      if (current.base) {
        current.base.text = current.base.text.trim();
      }
      if (current.comparison) {
        current.comparison.text = current.comparison.text.trim();
      }

      if ((current.base?.text && current.base.text.length > 0) || (current.comparison?.text && current.comparison.text.length > 0)) {
        changes.push(current);
      }
    }
    current = null;
    currentBaseParagraph = null;
    currentComparisonParagraph = null;
  };

  for (const token of tokens) {
    // Treat paragraph sentinels as hard boundaries, not visible changes
    if (token.text === PARAGRAPH_SENTINEL) {
      if (token.type === 'removed' && baseIndex < baseMetadata.length) {
        baseIndex += 1;
      }
      if (token.type === 'added' && comparisonIndex < comparisonMetadata.length) {
        comparisonIndex += 1;
      }
      flush();
      continue;
    }
    if (token.type === 'removed') {
      const meta = baseMetadata[baseIndex] ?? null;
      const active = ensureCurrent();
      const paragraph = meta?.paragraph ?? null;
      if (!active.base) {
        active.base = {
          text: token.text,
          page: meta?.page ?? null,
          paragraph: meta?.paragraph ?? null,
        };
        currentBaseParagraph = paragraph;
      } else {
        if (
          paragraph !== null &&
          currentBaseParagraph !== null &&
          paragraph !== currentBaseParagraph &&
          active.base.text.trim().length > 0
        ) {
          // Start a new change for a new paragraph to avoid ballooning
          flush();
          const next = ensureCurrent();
          next.base = {
            text: token.text,
            page: meta?.page ?? null,
            paragraph: paragraph,
          };
        } else {
          active.base.text = appendWord(active.base.text, token.text);
        }
        if (meta && active.base.page === null) {
          active.base.page = meta.page;
        }
        if (meta && active.base.paragraph === null) {
          active.base.paragraph = meta.paragraph;
        }
        if (paragraph !== null) {
          currentBaseParagraph = paragraph;
        }
      }
      if (baseIndex < baseMetadata.length) {
        baseIndex += 1;
      }
      continue;
    }

    if (token.type === 'added') {
      const meta = comparisonMetadata[comparisonIndex] ?? null;
      const active = ensureCurrent();
      const paragraph = meta?.paragraph ?? null;
      if (!active.comparison) {
        active.comparison = {
          text: token.text,
          page: meta?.page ?? null,
          paragraph: meta?.paragraph ?? null,
        };
        currentComparisonParagraph = paragraph;
      } else {
        if (
          paragraph !== null &&
          currentComparisonParagraph !== null &&
          paragraph !== currentComparisonParagraph &&
          active.comparison.text.trim().length > 0
        ) {
          // Start a new change for a new paragraph to avoid ballooning
          flush();
          const next = ensureCurrent();
          next.comparison = {
            text: token.text,
            page: meta?.page ?? null,
            paragraph: paragraph,
          };
        } else {
          active.comparison.text = appendWord(active.comparison.text, token.text);
        }
        if (meta && active.comparison.page === null) {
          active.comparison.page = meta.page;
        }
        if (meta && active.comparison.paragraph === null) {
          active.comparison.paragraph = meta.paragraph;
        }
        if (paragraph !== null) {
          currentComparisonParagraph = paragraph;
        }
      }
      if (comparisonIndex < comparisonMetadata.length) {
        comparisonIndex += 1;
      }
      continue;
    }

    // unchanged token
    flush();
    if (baseIndex < baseMetadata.length) {
      baseIndex += 1;
    }
    if (comparisonIndex < comparisonMetadata.length) {
      comparisonIndex += 1;
    }
  }

  flush();

  return changes;
};

const createSummaryFile = (result: CompareResultData): File => {
  const exportPayload = {
    generatedAt: new Date(result.totals.processedAt).toISOString(),
    base: {
      name: result.base.fileName,
      totalWords: result.base.wordCount,
    },
    comparison: {
      name: result.comparison.fileName,
      totalWords: result.comparison.wordCount,
    },
    totals: {
      added: result.totals.added,
      removed: result.totals.removed,
      unchanged: result.totals.unchanged,
      durationMs: result.totals.durationMs,
    },
    changes: result.changes.map((change) => ({
      base: change.base,
      comparison: change.comparison,
    })),
    warnings: result.warnings,
  };

  const filename = `compare-summary-${new Date(result.totals.processedAt).toISOString().replace(/[:.]/g, '-')}.json`;
  return new File([JSON.stringify(exportPayload, null, 2)], filename, { type: 'application/json' });
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const extractContentFromPdf = async (file: StirlingFile): Promise<ExtractedContent> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfWorkerManager.createDocument(arrayBuffer, {
    disableAutoFetch: true,
    disableStream: true,
  });

  try {
    const tokens: string[] = [];
    const metadata: TokenMetadata[] = [];
    const pageSizes: { width: number; height: number }[] = [];
    const paragraphs: CompareParagraph[] = [];
    for (let pageIndex = 1; pageIndex <= pdfDoc.numPages; pageIndex += 1) {
      const page = await pdfDoc.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      // pdf.js typings may not include disableCombineTextItems; pass via any
      const content = await (page as any).getTextContent({ disableCombineTextItems: true });
      const styles: Record<string, { fontFamily?: string }> = ((content as any).styles ?? {}) as Record<
        string,
        { fontFamily?: string }
      >;

      let paragraphIndex = 1;
      let paragraphBuffer = '';
      let prevItem: TextItem | null = null;

      pageSizes.push({ width: viewport.width, height: viewport.height });

      const normalizeToken = (s: string) =>
        s
          .normalize('NFKC')
          .replace(/[\u00AD\u200B-\u200F\u202A-\u202E]/g, '')
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/[–—]/g, '-')
          .replace(/\s+/g, ' ')
          .trim();

      const normalizeAndSplit = (raw: string) => {
        const norm = normalizeToken(raw);
        const parts = norm.match(/[A-Za-z0-9]+|[^\sA-Za-z0-9]/g) || [];
        return parts.filter(Boolean);
      };

      const isParagraphBreak = (curr: TextItem, prev: TextItem | null, yJumpThreshold = 6) => {
        const hasHardBreak = 'hasEOL' in curr && (curr as TextItem).hasEOL;
        if (hasHardBreak) return true;
        if (!prev) return false;
        const prevY = prev.transform[5];
        const currY = curr.transform[5];
        return Math.abs(currY - prevY) > yJumpThreshold;
      };

      const adjustBoundingBox = (left: number, top: number, width: number, height: number): TokenBoundingBox | null => {
        if (width <= 0 || height <= 0) {
          return null;
        }

        const MIN_WIDTH = 0.004; // ensure very short tokens still get a visible highlight
        const MIN_HORIZONTAL_PAD = 0.0012;
        const HORIZONTAL_PAD_RATIO = 0.12;
        const MIN_VERTICAL_PAD = 0.0008;
        const VERTICAL_PAD_RATIO = 0.18;

        const horizontalPad = Math.max(width * HORIZONTAL_PAD_RATIO, MIN_HORIZONTAL_PAD);
        const verticalPad = Math.max(height * VERTICAL_PAD_RATIO, MIN_VERTICAL_PAD);

        let expandedLeft = left - horizontalPad;
        let expandedRight = left + width + horizontalPad;
        let expandedTop = top - verticalPad;
        let expandedBottom = top + height + verticalPad;

        if (expandedRight - expandedLeft < MIN_WIDTH) {
          const deficit = MIN_WIDTH - (expandedRight - expandedLeft);
          expandedLeft -= deficit / 2;
          expandedRight += deficit / 2;
        }

        expandedLeft = clamp(expandedLeft);
        expandedRight = clamp(expandedRight);
        expandedTop = clamp(expandedTop);
        expandedBottom = clamp(expandedBottom);

        if (expandedRight <= expandedLeft || expandedBottom <= expandedTop) {
          return null;
        }

        return {
          left: expandedLeft,
          top: expandedTop,
          width: expandedRight - expandedLeft,
          height: expandedBottom - expandedTop,
        };
      };

      for (const item of content.items as TextItem[]) {
        if (!item?.str) {
          prevItem = null;
          continue;
        }

        // Compute a per-word bounding box within this TextItem by proportionally
        // subdividing the item's horizontal span based on character weights
        // (simple glyph-width heuristic) rather than naive character counts.
        const rawText = item.str;
        const totalLen = Math.max(rawText.length, 1);
        const styles: any = (content as any).styles || {};

        const textStyle = styles[item.fontName] as { fontFamily?: string } | undefined;
        const fontFamily = textStyle?.fontFamily ?? 'sans-serif';
        const fontScale = Math.max(0.5, Math.hypot(item.transform[0], item.transform[1]) || 0);
        const fontSpec = `${fontScale}px ${fontFamily}`;

        const weights: number[] = new Array(totalLen);
        let runningText = '';
        let previousAdvance = 0;
        for (let i = 0; i < totalLen; i += 1) {
          runningText += rawText[i];
          const advance = measureTextWidth(fontSpec, runningText);
          let width = advance - previousAdvance;
          if (!Number.isFinite(width) || width <= 0) {
            width = rawText[i] === ' ' ? DEFAULT_SPACE_WIDTH : DEFAULT_CHAR_WIDTH;
          }
          weights[i] = width;
          previousAdvance = advance;
        }
        if (!Number.isFinite(previousAdvance) || previousAdvance <= 0) {
          for (let i = 0; i < totalLen; i += 1) {
            weights[i] = rawText[i] === ' ' ? DEFAULT_SPACE_WIDTH : DEFAULT_CHAR_WIDTH;
          }
        }
        const prefix: number[] = new Array(totalLen + 1);
        prefix[0] = 0;
        for (let i = 0; i < totalLen; i += 1) prefix[i + 1] = prefix[i] + weights[i];
        const totalWeight = prefix[totalLen] || 1;

        const [rawX, rawY] = [item.transform[4], item.transform[5]];
        const [x1, y1] = viewport.convertToViewportPoint(rawX, rawY);
        const [x2, y2] = viewport.convertToViewportPoint(rawX + item.width, rawY + item.height);

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);

          let normalizedTop = clamp(top / viewport.height);
          let normalizedBottom = clamp(bottom / viewport.height);
          let height = Math.max(normalizedBottom - normalizedTop, 0);

          // Tighten vertical box using font ascent/descent when available
          const fontName: string | undefined = (item as any).fontName;
          const font = fontName ? styles[fontName] : undefined;
          const ascent = typeof font?.ascent === 'number' ? Math.max(0.7, Math.min(1.1, font.ascent)) : 0.9;
          const descent = typeof font?.descent === 'number' ? Math.max(0.0, Math.min(0.5, Math.abs(font.descent))) : 0.2;
          const vFactor = Math.min(1, Math.max(0.75, ascent + descent));
          const shrink = height * (1 - vFactor);
          if (shrink > 0) {
            normalizedTop += shrink / 2;
            height = height * vFactor;
            normalizedBottom = normalizedTop + height;
          }

        const wordRegex = /[A-Za-z0-9]+|[^\sA-Za-z0-9]/g;
        let match: RegExpExecArray | null;
        while ((match = wordRegex.exec(rawText)) !== null) {
          const wordRaw = match[0];
          const normalizedWord = normalizeToken(wordRaw);
          if (!normalizedWord) {
            continue;
          }
          const startIndex = match.index;
          const endIndex = startIndex + wordRaw.length;

          const relStart = prefix[startIndex] / totalWeight;
          const relEnd = prefix[endIndex] / totalWeight;
          const segLeft = left + (right - left) * relStart;
          const segRight = left + (right - left) * relEnd;

          const normalizedLeft = clamp(Math.min(segLeft, segRight) / viewport.width);
          const normalizedRight = clamp(Math.max(segLeft, segRight) / viewport.width);
          const width = Math.max(normalizedRight - normalizedLeft, 0);

          const bbox = adjustBoundingBox(normalizedLeft, normalizedTop, width, height);

          tokens.push(normalizedWord);
          metadata.push({
            page: pageIndex,
            paragraph: paragraphIndex,
            bbox,
          });

          paragraphBuffer = appendWord(paragraphBuffer, normalizedWord);
        }

        if (isParagraphBreak(item, prevItem)) {
          if (paragraphBuffer.trim().length > 0) {
            paragraphs.push({ page: pageIndex, paragraph: paragraphIndex, text: paragraphBuffer.trim() });
            paragraphBuffer = '';
          }
          tokens.push(PARAGRAPH_SENTINEL);
          metadata.push({ page: pageIndex, paragraph: paragraphIndex, bbox: null });
          paragraphIndex += 1;
        }
        prevItem = item;
      }

      // Flush any dangling paragraph at end of page
      if (paragraphBuffer.trim().length > 0) {
        paragraphs.push({ page: pageIndex, paragraph: paragraphIndex, text: paragraphBuffer.trim() });
        paragraphBuffer = '';
        tokens.push(PARAGRAPH_SENTINEL);
        metadata.push({ page: pageIndex, paragraph: paragraphIndex, bbox: null });
      }
    }
    return { tokens, metadata, pageSizes, paragraphs };
  } finally {
    pdfWorkerManager.destroyDocument(pdfDoc);
  }
};

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
              const error = new Error(message.message);
              (error as any).code = message.code;
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
            settings: DEFAULT_WORKER_SETTINGS,
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
        complexMessage: t(
          'compare.complex.message',
          'One or both of the provided documents are large files, accuracy of comparison may be reduced'
        ),
        tooLargeMessage: t(
          'compare.large.file.message',
          'One or Both of the provided documents are too large to process'
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

        const { tokens, stats, warnings: workerWarnings } = await runCompareWorker(
          baseContent.tokens,
          comparisonContent.tokens,
          warningMessages
        );

        const totals = aggregateTotals(tokens);
        const processedAt = Date.now();

        const baseMetadata = baseContent.metadata;
        const comparisonMetadata = comparisonContent.metadata;

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
      } catch (error: any) {
        console.error('[compare] operation failed', error);
        if (error?.code === 'TOO_LARGE') {
          setErrorMessage(warningMessages.tooLargeMessage ?? t('compare.error.generic', 'Unable to compare these files.'));
        } else if (error?.code === 'EMPTY_TEXT') {
          setErrorMessage(warningMessages.emptyTextMessage ?? t('compare.error.generic', 'Unable to compare these files.'));
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : t('compare.error.generic', 'Unable to compare these files.')
          );
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
