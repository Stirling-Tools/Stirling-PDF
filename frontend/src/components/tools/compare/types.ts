import type { TokenBoundingBox } from '../../../types/compare';

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
