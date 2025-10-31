import { SpreadMode } from '@embedpdf/plugin-spread/react';

export interface ScrollAPIWrapper {
  scrollToPage: (params: { pageNumber: number }) => void;
  scrollToPreviousPage: () => void;
  scrollToNextPage: () => void;
}

export interface ZoomAPIWrapper {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleMarqueeZoom: () => void;
  requestZoom: (level: number) => void;
}

export interface PanAPIWrapper {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
}

export interface SelectionAPIWrapper {
  copyToClipboard: () => void;
  getSelectedText: () => string | any;
  getFormattedSelection: () => any;
}

export interface SpreadAPIWrapper {
  setSpreadMode: (mode: SpreadMode) => void;
  getSpreadMode: () => SpreadMode | null;
  toggleSpreadMode: () => void;
}

export interface RotationAPIWrapper {
  rotateForward: () => void;
  rotateBackward: () => void;
  setRotation: (rotation: number) => void;
  getRotation: () => number;
}

export interface SearchAPIWrapper {
  search: (query: string) => Promise<any>;
  clear: () => void;
  next: () => void;
  previous: () => void;
}

export interface ThumbnailAPIWrapper {
  renderThumb: (pageIndex: number, scale: number) => {
    toPromise: () => Promise<Blob>;
  };
}

export interface ExportAPIWrapper {
  download: () => void;
  saveAsCopy: () => { toPromise: () => Promise<ArrayBuffer> };
}

export interface ScrollState {
  currentPage: number;
  totalPages: number;
}

export interface ZoomState {
  currentZoom: number;
  zoomPercent: number;
}

export interface PanState {
  isPanning: boolean;
}

export interface SelectionState {
  hasSelection: boolean;
}

export interface SpreadState {
  spreadMode: SpreadMode;
  isDualPage: boolean;
}

export interface RotationState {
  rotation: number;
}

export interface SearchResult {
  pageIndex: number;
  rects: Array<{
    origin: { x: number; y: number };
    size: { width: number; height: number };
  }>;
}

export interface SearchState {
  results: SearchResult[] | null;
  activeIndex: number;
}

export interface ExportState {
  canExport: boolean;
}

export interface BridgeRef<TState = unknown, TApi = unknown> {
  state: TState;
  api: TApi;
}

export interface BridgeStateMap {
  scroll: ScrollState;
  zoom: ZoomState;
  pan: PanState;
  selection: SelectionState;
  spread: SpreadState;
  rotation: RotationState;
  search: SearchState;
  thumbnail: unknown;
  export: ExportState;
}

export interface BridgeApiMap {
  scroll: ScrollAPIWrapper;
  zoom: ZoomAPIWrapper;
  pan: PanAPIWrapper;
  selection: SelectionAPIWrapper;
  spread: SpreadAPIWrapper;
  rotation: RotationAPIWrapper;
  search: SearchAPIWrapper;
  thumbnail: ThumbnailAPIWrapper;
  export: ExportAPIWrapper;
}

export type BridgeKey = keyof BridgeStateMap;

export type ViewerBridgeRegistry = {
  [K in BridgeKey]: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]> | null;
};

export const createBridgeRegistry = (): ViewerBridgeRegistry => ({
  scroll: null,
  zoom: null,
  pan: null,
  selection: null,
  spread: null,
  rotation: null,
  search: null,
  thumbnail: null,
  export: null,
});

export function registerBridge<K extends BridgeKey>(
  registry: ViewerBridgeRegistry,
  type: K,
  ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]>
): void {
  registry[type] = ref;
}

export function getBridgeState<K extends BridgeKey>(
  registry: ViewerBridgeRegistry,
  type: K,
  fallback: BridgeStateMap[K]
): BridgeStateMap[K] {
  return registry[type]?.state ?? fallback;
}

export function getBridgeApi<K extends BridgeKey>(
  registry: ViewerBridgeRegistry,
  type: K
): BridgeApiMap[K] | null {
  return registry[type]?.api ?? null;
}
