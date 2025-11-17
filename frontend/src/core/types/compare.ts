import type { FileId } from '@app/types/file';
import type { StirlingFile } from '@app/types/fileContext';

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

export interface CompareFilteredTokenInfo {
  token: string;
  page: number | null;
  paragraph: number | null;
  bbox: TokenBoundingBox | null;
  hasHighlight: boolean;
  metaIndex: number;
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
  filteredTokenData: {
    base: CompareFilteredTokenInfo[];
    comparison: CompareFilteredTokenInfo[];
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
  tooDissimilarMessage?: string;
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
      // Early-stop and runtime controls (optional)
      earlyStopEnabled?: boolean;
      minJaccardUnigram?: number;
      minJaccardBigram?: number;
      minTokensForEarlyStop?: number;
      sampleLimit?: number;
      runtimeMaxProcessedTokens?: number;
      runtimeMinUnchangedRatio?: number;
    };
  };
}

export type CompareWorkerResponse =
  | {
      type: 'chunk';
      tokens: CompareDiffToken[];
    }
  | {
      type: 'success';
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
      code?: 'EMPTY_TEXT' | 'TOO_LARGE' | 'TOO_DISSIMILAR';
    };

export interface CompareDocumentPaneProps {
  pane: 'base' | 'comparison';
  layout: 'side-by-side' | 'stacked';
  scrollRef: React.RefObject<HTMLDivElement | null>;
  peerScrollRef: React.RefObject<HTMLDivElement | null>;
  handleScrollSync: (source: HTMLDivElement | null, target: HTMLDivElement | null) => void;
  handleWheelZoom: (pane: 'base' | 'comparison', event: React.WheelEvent<HTMLDivElement>) => void;
  handleWheelOverscroll: (pane: 'base' | 'comparison', event: React.WheelEvent<HTMLDivElement>) => void;
  onTouchStart: (pane: 'base' | 'comparison', event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
  isPanMode: boolean;
  zoom: number;
  title: string;
  dropdownPlaceholder?: React.ReactNode;
  changes: Array<{ value: string; label: string; pageNumber?: number }>;
  onNavigateChange: (id: string, pageNumber?: number) => void;
  isLoading: boolean;
  processingMessage: string;
  pages: PagePreview[];
  pairedPages: PagePreview[];
  getRowHeightPx: (pageNumber: number) => number;
  wordHighlightMap: Map<number, WordHighlightEntry[]>;
  metaIndexToGroupId: Map<number, string>;
  documentLabel: string;
  pageLabel: string;
  altLabel: string;
  // Page input/navigation props (optional to keep call sites flexible)
  pageInputValue?: string;
  onPageInputChange?: (next: string) => void;
  maxSharedPages?: number; // min(baseTotal, compTotal)
  renderedPageNumbers?: Set<number>;
  onVisiblePageChange?: (pane: 'base' | 'comparison', pageNumber: number) => void;
}

// Import types that are referenced in CompareDocumentPaneProps
export interface PagePreview {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  url: string | null;
}

export interface WordHighlightEntry {
  rect: TokenBoundingBox;
  metaIndex: number;
}

export interface NavigationDropdownProps {
  changes: Array<{ value: string; label: string; pageNumber?: number }>;
  placeholder: React.ReactNode;
  className?: string;
  onNavigate: (value: string, pageNumber?: number) => void;
  // Optional: pages that currently have previews rendered (1-based page numbers)
  renderedPageNumbers?: Set<number>;
}

// Pan/Zoom and Compare Workbench shared types (moved out of hooks for reuse)
import type React from 'react';

export type ComparePane = 'base' | 'comparison';

export interface PanState {
  x: number;
  y: number;
}

export interface ScrollLinkDelta {
  vertical: number;
  horizontal: number;
}

export interface ScrollLinkAnchors {
  deltaPixelsBaseToComp: number;
  deltaPixelsCompToBase: number;
}

export interface PanDragState {
  active: boolean;
  source: ComparePane | null;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  targetStartPanX: number;
  targetStartPanY: number;
}

export interface PinchState {
  active: boolean;
  pane: ComparePane | null;
  startDistance: number;
  startZoom: number;
}

export interface UseComparePanZoomOptions {
  prefersStacked: boolean;
  basePages: PagePreview[];
  comparisonPages: PagePreview[];
}

export interface UseComparePanZoomReturn {
  layout: 'side-by-side' | 'stacked';
  setLayout: (layout: 'side-by-side' | 'stacked') => void;
  toggleLayout: () => void;
  baseScrollRef: React.RefObject<HTMLDivElement | null>;
  comparisonScrollRef: React.RefObject<HTMLDivElement | null>;
  isScrollLinked: boolean;
  setIsScrollLinked: (value: boolean) => void;
  captureScrollLinkDelta: () => void;
  clearScrollLinkDelta: () => void;
  isPanMode: boolean;
  setIsPanMode: (value: boolean) => void;
  baseZoom: number;
  setBaseZoom: (value: number) => void;
  comparisonZoom: number;
  setComparisonZoom: (value: number) => void;
  basePan: PanState;
  comparisonPan: PanState;
  setPanToTopLeft: (pane: ComparePane) => void;
  centerPanForZoom: (pane: ComparePane, zoom: number) => void;
  clampPanForZoom: (pane: ComparePane, zoom: number) => void;
  handleScrollSync: (source: HTMLDivElement | null, target: HTMLDivElement | null) => void;
  beginPan: (pane: ComparePane, event: React.MouseEvent<HTMLDivElement>) => void;
  continuePan: (event: React.MouseEvent<HTMLDivElement>) => void;
  endPan: () => void;
  handleWheelZoom: (pane: ComparePane, event: React.WheelEvent<HTMLDivElement>) => void;
  handleWheelOverscroll: (pane: ComparePane, event: React.WheelEvent<HTMLDivElement>) => void;
  onTouchStart: (pane: ComparePane, event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: () => void;
  zoomLimits: { min: number; max: number; step: number };
}

export interface PagePreview {
  pageNumber: number;
  width: number;  
  height: number;
  rotation: number;
  url: string | null;
}

export interface WordHighlightEntry {
  rect: TokenBoundingBox;
  metaIndex: number;
}

// Removed legacy upload section types; upload flow now uses the standard active files workbench

export interface CompareWorkbenchData {
  result: CompareResultData | null;
  baseFileId: FileId | null;
  comparisonFileId: FileId | null;
  onSelectBase?: (fileId: FileId | null) => void;
  onSelectComparison?: (fileId: FileId | null) => void;
  isLoading?: boolean;
  baseLocalFile?: StirlingFile | null;
  comparisonLocalFile?: StirlingFile | null;
}

export interface CompareChangeOption {
  value: string;
  label: string;
  pageNumber: number;
}