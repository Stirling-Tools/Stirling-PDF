import type { TokenBoundingBox } from '../../../types/compare';

export interface PagePreview {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  url: string;
}

export interface WordHighlightEntry {
  rect: TokenBoundingBox;
  index: number;
}
