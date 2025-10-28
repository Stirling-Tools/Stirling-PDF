import { useCallback, useMemo } from 'react';
import type {
  CompareDiffToken,
  CompareResultData,
  CompareTokenMetadata,
} from '../../../../types/compare';
import type { CompareChangeOption } from '../../../../types/compareWorkbench';
import type { PagePreview } from '../../../../hooks/useProgressivePagePreviews';
import type { WordHighlightEntry } from '../types';
import { PARAGRAPH_SENTINEL } from '../../../../types/compare';

interface TokenGroupMap {
  base: Map<number, string>;
  comparison: Map<number, string>;
}

interface WordHighlightMaps {
  base: Map<number, WordHighlightEntry[]>;
  comparison: Map<number, WordHighlightEntry[]>;
}

export interface UseCompareHighlightsResult {
  baseWordChanges: CompareChangeOption[];
  comparisonWordChanges: CompareChangeOption[];
  tokenIndexToGroupId: TokenGroupMap;
  wordHighlightMaps: WordHighlightMaps;
  getRowHeightPx: (pageNumber: number) => number;
}

const buildWordChanges = (
  tokens: CompareDiffToken[],
  metadata: CompareTokenMetadata[],
  targetType: 'added' | 'removed',
  tokenIndexToGroupId: Map<number, string>,
  groupPrefix: string
): CompareChangeOption[] => {
  tokenIndexToGroupId.clear();
  if (!tokens.length) return [];

  const items: CompareChangeOption[] = [];
  let metadataIndex = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === targetType) {
      const parts: string[] = [];
      const runIndices: number[] = [];
      // We'll compute the page number from the first token in the run that has a bbox
      let firstPageWithBox: number | null = null;
      while (i < tokens.length && tokens[i].type === targetType) {
        const t = tokens[i].text;
        const isPara = t === PARAGRAPH_SENTINEL || t.startsWith('\uE000') || t.includes('PARA');
        // Skip paragraph sentinel tokens entirely from labels and grouping
        if (!isPara) {
          parts.push(t);
          // Only add to grouping if there is a corresponding metadata index
          // AND there is a bounding box to anchor highlights to
          const meta = metadata[metadataIndex];
          if (meta) {
            if (meta.bbox) {
              runIndices.push(metadataIndex);
              if (firstPageWithBox == null && typeof meta.page === 'number') {
                firstPageWithBox = meta.page;
              }
            }
          }
        }
        metadataIndex += 1;
        i += 1;
      }
      i -= 1;
      const label = parts.join(' ').trim();
      if (label.length > 0 && runIndices.length > 0) {
        const startIndexForId = runIndices[0];
        const endIndexForId = runIndices[runIndices.length - 1];
        const groupId = `${groupPrefix}-${startIndexForId}-${endIndexForId}`;
        runIndices.forEach((idx) => tokenIndexToGroupId.set(idx, groupId));
        const pageNumber = firstPageWithBox ?? (metadata[startIndexForId]?.page ?? 1);
        items.push({ value: groupId, label, pageNumber });
      }
      continue;
    }
    if (token.type !== (targetType === 'added' ? 'removed' : 'added')) {
      metadataIndex += 1;
    }
  }

  return items;
};

export const useCompareHighlights = (
  result: CompareResultData | null,
  basePages: PagePreview[],
  comparisonPages: PagePreview[],
): UseCompareHighlightsResult => {
  const baseTokenIndexToGroupId = useMemo(() => new Map<number, string>(), []);
  const comparisonTokenIndexToGroupId = useMemo(() => new Map<number, string>(), []);

  const baseWordChanges = useMemo(() => {
    if (!result) return [];
    return buildWordChanges(
      result.tokens,
      result.tokenMetadata.base,
      'removed',
      baseTokenIndexToGroupId,
      'base-group'
    );
  }, [baseTokenIndexToGroupId, result]);

  const comparisonWordChanges = useMemo(() => {
    if (!result) return [];
    return buildWordChanges(
      result.tokens,
      result.tokenMetadata.comparison,
      'added',
      comparisonTokenIndexToGroupId,
      'comparison-group'
    );
  }, [comparisonTokenIndexToGroupId, result]);

  const wordHighlightMaps = useMemo(() => {
    if (!result) {
      return {
        base: new Map<number, WordHighlightEntry[]>(),
        comparison: new Map<number, WordHighlightEntry[]>(),
      };
    }

    const baseMap = new Map<number, WordHighlightEntry[]>();
    const comparisonMap = new Map<number, WordHighlightEntry[]>();

    let baseIndex = 0;
    let comparisonIndex = 0;
    for (const token of result.tokens) {
      if (token.type === 'removed') {
        const meta = result.tokenMetadata.base[baseIndex];
        if (meta?.bbox) {
          const list = baseMap.get(meta.page) ?? [];
          list.push({ rect: meta.bbox, index: baseIndex });
          baseMap.set(meta.page, list);
        }
        baseIndex += 1;
      } else if (token.type === 'added') {
        const meta = result.tokenMetadata.comparison[comparisonIndex];
        if (meta?.bbox) {
          const list = comparisonMap.get(meta.page) ?? [];
          list.push({ rect: meta.bbox, index: comparisonIndex });
          comparisonMap.set(meta.page, list);
        }
        comparisonIndex += 1;
      } else {
        baseIndex += 1;
        comparisonIndex += 1;
      }
    }

    return { base: baseMap, comparison: comparisonMap };
  }, [result]);

  const getRowHeightPx = useCallback(
    (pageNumber: number) => {
      const basePage = basePages.find((page) => page.pageNumber === pageNumber);
      const comparisonPage = comparisonPages.find((page) => page.pageNumber === pageNumber);
      const baseHeight = basePage ? basePage.height : 0;
      const comparisonHeight = comparisonPage ? comparisonPage.height : 0;
      const rowHeight = Math.max(baseHeight, comparisonHeight);
      return Math.round(rowHeight);
    },
    [basePages, comparisonPages]
  );

  return {
    baseWordChanges,
    comparisonWordChanges,
    tokenIndexToGroupId: {
      base: baseTokenIndexToGroupId,
      comparison: comparisonTokenIndexToGroupId,
    },
    wordHighlightMaps,
    getRowHeightPx,
  };
};
