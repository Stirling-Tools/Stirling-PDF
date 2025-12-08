import { pdfWorkerManager } from '@app/services/pdfWorkerManager';
import { appendWord as sharedAppendWord } from '@app/utils/textDiff';
import { PARAGRAPH_SENTINEL } from '@app/types/compare';
import type { StirlingFile } from '@app/types/fileContext';
import type { PDFPageProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type {
  CompareChange,
  CompareDiffToken,
  CompareResultData,
  TokenBoundingBox,
  CompareParagraph,
} from '@app/types/compare';

export interface TokenMetadata {
  page: number;
  paragraph: number;
  bbox: TokenBoundingBox | null;
}

export interface ExtractedContent {
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

export const measureTextWidth = (fontSpec: string, text: string): number => {
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

export const appendWord = (existing: string, word: string) => {
  if (!existing) {
    return sharedAppendWord('', word);
  }
  return sharedAppendWord(existing, word);
};

export const aggregateTotals = (tokens: CompareDiffToken[]) => {
  return tokens.reduce(
    (totals, token) => {
      if (token.text === '\uE000PARA') { // PARAGRAPH_SENTINEL safeguard if serialized
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

export const buildChanges = (
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

export const createSummaryFile = (result: CompareResultData): File => {
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

export const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export const getWorkerErrorCode = (value: unknown): 'EMPTY_TEXT' | 'TOO_LARGE' | 'TOO_DISSIMILAR' | undefined => {
  if (typeof value === 'object' && value !== null && 'code' in value) {
    const potentialCode = (value as { code?: 'EMPTY_TEXT' | 'TOO_LARGE' | 'TOO_DISSIMILAR' }).code;
    return potentialCode;
  }
  return undefined;
};

// Produce a filtered view of tokens/metadata that excludes paragraph sentinel markers,
// returning a mapping to original indices for potential future use.
export const filterTokensForDiff = (
  tokens: string[],
  metadata: TokenMetadata[],
): { tokens: string[]; metadata: TokenMetadata[]; filteredToOriginal: number[] } => {
  const outTokens: string[] = [];
  const outMeta: TokenMetadata[] = [];
  const map: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const isPara = t === PARAGRAPH_SENTINEL || t.startsWith('\uE000') || t.includes('PARA');
    if (!isPara) {
      outTokens.push(t);
      if (metadata[i]) outMeta.push(metadata[i]);
      map.push(i);
    }
  }
  return { tokens: outTokens, metadata: outMeta, filteredToOriginal: map };
};

export const extractContentFromPdf = async (file: StirlingFile): Promise<ExtractedContent> => {
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
      const page: PDFPageProxy = await pdfDoc.getPage(pageIndex);
      const viewport = page.getViewport({ scale: 1 });
      const content: TextContent = await page.getTextContent({
        disableCombineTextItems: true,
      } as Parameters<PDFPageProxy['getTextContent']>[0]);
      const styles: Record<string, { fontFamily?: string; ascent?: number; descent?: number }> = content.styles ?? {};

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
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const isParagraphBreak = (curr: TextItem, prev: TextItem | null) => {
        const hasHardBreak = 'hasEOL' in curr && (curr as TextItem).hasEOL;
        if (hasHardBreak) return true;
        if (!prev) return false;
        const prevY = prev.transform[5];
        const currY = curr.transform[5];
        const dy = Math.abs(currY - prevY);
        const currX = curr.transform[4];
        const prevX = prev.transform[4];
        const approxLine = Math.max(10, Math.abs((curr as any).height ?? 0) * 0.9);
        const looksLikeParagraph = dy > approxLine * 1.8;
        const likelySoftWrap = currX < prevX && dy < approxLine * 0.6;
        return looksLikeParagraph && !likelySoftWrap;
      };

      const adjustBoundingBox = (left: number, top: number, width: number, height: number): TokenBoundingBox | null => {
        if (width <= 0 || height <= 0) {
          return null;
        }

        const MIN_WIDTH = 0.004;
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

        const rawText = item.str;
        const totalLen = Math.max(rawText.length, 1);
        const textStyle = item.fontName ? styles[item.fontName] : undefined;
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

        const rawX = item.transform[4];
        const rawY = item.transform[5];
        const transformed = [
          viewport.convertToViewportPoint(rawX, rawY),
          viewport.convertToViewportPoint(rawX + item.width, rawY),
          viewport.convertToViewportPoint(rawX, rawY + item.height),
          viewport.convertToViewportPoint(rawX + item.width, rawY + item.height),
        ];
        const xs = transformed.map(([px]) => px);
        const ys = transformed.map(([, py]) => py);
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);

        if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
          prevItem = item;
          continue;
        }

        const [baselineStart, baselineEnd, verticalEnd] = transformed;
        const baselineVector: [number, number] = [
          baselineEnd[0] - baselineStart[0],
          baselineEnd[1] - baselineStart[1],
        ];
        const verticalVector: [number, number] = [
          verticalEnd[0] - baselineStart[0],
          verticalEnd[1] - baselineStart[1],
        ];
        const baselineMagnitude = Math.hypot(baselineVector[0], baselineVector[1]);
        const verticalMagnitude = Math.hypot(verticalVector[0], verticalVector[1]);
        const hasOrientationVectors = baselineMagnitude > 1e-6 && verticalMagnitude > 1e-6;

        const font = item.fontName ? styles[item.fontName] : undefined;
        const ascent = typeof font?.ascent === 'number' ? Math.max(0.7, Math.min(1.1, font.ascent)) : 0.9;
        const descent = typeof font?.descent === 'number' ? Math.max(0.0, Math.min(0.5, Math.abs(font.descent))) : 0.2;
        const verticalScale = Math.min(1, Math.max(0.75, ascent + descent));

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

          let wordLeftAbs: number;
          let wordRightAbs: number;
          let wordTopAbs: number;
          let wordBottomAbs: number;

          if (hasOrientationVectors) {
            const segStart: [number, number] = [
              baselineStart[0] + baselineVector[0] * relStart,
              baselineStart[1] + baselineVector[1] * relStart,
            ];
            const segEnd: [number, number] = [
              baselineStart[0] + baselineVector[0] * relEnd,
              baselineStart[1] + baselineVector[1] * relEnd,
            ];
            const cornerPoints: Array<[number, number]> = [
              segStart,
              [segStart[0] + verticalVector[0], segStart[1] + verticalVector[1]],
              [segEnd[0] + verticalVector[0], segEnd[1] + verticalVector[1]],
              segEnd,
            ];
            const cornerXs = cornerPoints.map(([px]) => px);
            const cornerYs = cornerPoints.map(([, py]) => py);
            wordLeftAbs = Math.min(...cornerXs);
            wordRightAbs = Math.max(...cornerXs);
            wordTopAbs = Math.min(...cornerYs);
            wordBottomAbs = Math.max(...cornerYs);
          } else {
            const segLeftAbs = left + (right - left) * relStart;
            const segRightAbs = left + (right - left) * relEnd;
            wordLeftAbs = Math.min(segLeftAbs, segRightAbs);
            wordRightAbs = Math.max(segLeftAbs, segRightAbs);
            wordTopAbs = top;
            wordBottomAbs = bottom;
          }

          const wordLeft = clamp(wordLeftAbs / viewport.width);
          const wordRight = clamp(wordRightAbs / viewport.width);
          const wordTop = clamp(wordTopAbs / viewport.height);
          const wordBottom = clamp(wordBottomAbs / viewport.height);
          const wordWidth = Math.max(0, wordRight - wordLeft);
          let wordHeight = Math.max(0, wordBottom - wordTop);

          if (wordHeight > 0 && verticalScale < 1) {
            const midY = (wordTop + wordBottom) / 2;
            const shrunkHeight = Math.max(0, wordHeight * verticalScale);
            const half = shrunkHeight / 2;
            const newTop = clamp(midY - half);
            const newBottom = clamp(midY + half);
            wordHeight = Math.max(0, newBottom - newTop);
            const bbox = adjustBoundingBox(wordLeft, newTop, wordWidth, wordHeight);
            tokens.push(normalizedWord);
            metadata.push({ page: pageIndex, paragraph: paragraphIndex, bbox });
            paragraphBuffer = appendWord(paragraphBuffer, normalizedWord);
            continue;
          }

          const bbox = adjustBoundingBox(wordLeft, wordTop, wordWidth, wordHeight);

          tokens.push(normalizedWord);
          metadata.push({
            page: pageIndex,
            paragraph: paragraphIndex,
            bbox,
          });

          paragraphBuffer = appendWord(paragraphBuffer, normalizedWord);
        }

        if (isParagraphBreak(item as TextItem, prevItem)) {
          if (paragraphBuffer.trim().length > 0) {
            paragraphs.push({ page: pageIndex, paragraph: paragraphIndex, text: paragraphBuffer.trim() });
            paragraphBuffer = '';
          }
          tokens.push('\uE000PARA');
          metadata.push({ page: pageIndex, paragraph: paragraphIndex, bbox: null });
          paragraphIndex += 1;
        }
        prevItem = item as TextItem;
      }

      if (paragraphBuffer.trim().length > 0) {
        paragraphs.push({ page: pageIndex, paragraph: paragraphIndex, text: paragraphBuffer.trim() });
        paragraphBuffer = '';
        tokens.push('\uE000PARA');
        metadata.push({ page: pageIndex, paragraph: paragraphIndex, bbox: null });
      }
    }
    return { tokens, metadata, pageSizes, paragraphs };
  } finally {
    pdfWorkerManager.destroyDocument(pdfDoc);
  }
};


