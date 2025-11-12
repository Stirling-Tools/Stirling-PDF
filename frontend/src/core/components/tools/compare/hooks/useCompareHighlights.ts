import { useCallback, useMemo } from 'react';
import type {
  CompareFilteredTokenInfo,
  WordHighlightEntry,
  CompareResultData,
  CompareChangeOption,
  PagePreview,
} from '@app/types/compare';

interface MetaGroupMap {
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
  metaIndexToGroupId: MetaGroupMap;
  wordHighlightMaps: WordHighlightMaps;
  getRowHeightPx: (pageNumber: number) => number;
}

const buildWordChanges = (
  tokens: CompareFilteredTokenInfo[],
  metaIndexToGroupId: Map<number, string>,
  groupPrefix: string
): CompareChangeOption[] => {
  metaIndexToGroupId.clear();
  if (!tokens.length) return [];

  const items: CompareChangeOption[] = [];
  let currentRun: CompareFilteredTokenInfo[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;
    const label = currentRun.map((token) => token.token).join(' ').trim();
    if (label.length === 0) {
      currentRun = [];
      return;
    }
    const first = currentRun[0];
    const last = currentRun[currentRun.length - 1];
    const groupId = `${groupPrefix}-t${first.metaIndex}-t${last.metaIndex}`;
    currentRun.forEach((token) => {
      metaIndexToGroupId.set(token.metaIndex, groupId);
    });
    const pageNumber = first.page ?? last.page ?? 1;
    items.push({ value: groupId, label, pageNumber });
    currentRun = [];
  };

  for (const token of tokens) {
    if (token.hasHighlight && token.bbox) {
      currentRun.push(token);
    } else {
      flushRun();
    }
  }
  flushRun();

  return items;
};

const buildHighlightMap = (
  tokens: CompareFilteredTokenInfo[]
): Map<number, WordHighlightEntry[]> => {
  const map = new Map<number, WordHighlightEntry[]>();
  for (const token of tokens) {
    if (!token.hasHighlight || !token.bbox || token.page == null) continue;
    const list = map.get(token.page) ?? [];
    list.push({ rect: token.bbox, metaIndex: token.metaIndex });
    map.set(token.page, list);
  }
  return map;
};

export const useCompareHighlights = (
  result: CompareResultData | null,
  basePages: PagePreview[],
  comparisonPages: PagePreview[],
): UseCompareHighlightsResult => {
  const baseMetaIndexToGroupId = useMemo(() => new Map<number, string>(), []);
  const comparisonMetaIndexToGroupId = useMemo(() => new Map<number, string>(), []);

  const baseWordChanges = useMemo(() => {
    if (!result) return [];
    return buildWordChanges(
      result.filteredTokenData.base,
      baseMetaIndexToGroupId,
      'base-group'
    );
  }, [baseMetaIndexToGroupId, result]);

  const comparisonWordChanges = useMemo(() => {
    if (!result) return [];
    return buildWordChanges(
      result.filteredTokenData.comparison,
      comparisonMetaIndexToGroupId,
      'comparison-group'
    );
  }, [comparisonMetaIndexToGroupId, result]);

  const wordHighlightMaps = useMemo(() => {
    if (!result) {
      return {
        base: new Map<number, WordHighlightEntry[]>(),
        comparison: new Map<number, WordHighlightEntry[]>(),
      };
    }

    return {
      base: buildHighlightMap(result.filteredTokenData.base),
      comparison: buildHighlightMap(result.filteredTokenData.comparison),
    };
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
    metaIndexToGroupId: {
      base: baseMetaIndexToGroupId,
      comparison: comparisonMetaIndexToGroupId,
    },
    wordHighlightMaps,
    getRowHeightPx,
  };
};
