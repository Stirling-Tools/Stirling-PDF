export type CompareDiffTokenType = 'unchanged' | 'removed' | 'added';

export interface CompareDiffToken {
  type: CompareDiffTokenType;
  text: string;
}

export const REMOVAL_HIGHLIGHT = '#FF3B30';
export const ADDITION_HIGHLIGHT = '#34C759';
export const PARAGRAPH_SENTINEL = '\uE000¶';

export interface TokenBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CompareTokenMetadata {
  page: number;
  paragraph: number;
  bbox: TokenBoundingBox | null;
}

export interface ComparePageSize {
  width: number;
  height: number;
}

export interface CompareDocumentInfo {
  fileId: string;
  fileName: string;
  highlightColor: string;
  wordCount: number;
  pageSizes: ComparePageSize[];
}

export interface CompareParagraph {
  page: number;
  paragraph: number;
  text: string;
}

export interface CompareChangeSide {
  text: string;
  page: number | null;
  paragraph: number | null;
}

export interface CompareChange {
  id: string;
  base: CompareChangeSide | null;
  comparison: CompareChangeSide | null;
}

export interface CompareResultData {
  base: CompareDocumentInfo;
  comparison: CompareDocumentInfo;
  totals: {
    added: number;
    removed: number;
    unchanged: number;
    durationMs: number;
    processedAt: number;
  };
  tokens: CompareDiffToken[];
  tokenMetadata: {
    base: CompareTokenMetadata[];
    comparison: CompareTokenMetadata[];
  };
  sourceTokens: {
    base: string[];
    comparison: string[];
  };
  changes: CompareChange[];
  warnings: string[];
  baseParagraphs: CompareParagraph[];
  comparisonParagraphs: CompareParagraph[];
}

export interface CompareWorkerWarnings {
  complexMessage?: string;
  tooLargeMessage?: string;
  emptyTextMessage?: string;
}

export interface CompareWorkerRequest {
  type: 'compare';
  payload: {
    baseTokens: string[];
    comparisonTokens: string[];
    warnings: CompareWorkerWarnings;
    settings?: {
      batchSize?: number;
      complexThreshold?: number;
      maxWordThreshold?: number;
    };
  };
}

export type CompareWorkerResponse =
  | {
      type: 'success';
      tokens: CompareDiffToken[];
      stats: {
        baseWordCount: number;
        comparisonWordCount: number;
        durationMs: number;
      };
    }
  | {
      type: 'warning';
      message: string;
    }
  | {
      type: 'error';
      message: string;
      code?: 'EMPTY_TEXT' | 'TOO_LARGE';
    };
