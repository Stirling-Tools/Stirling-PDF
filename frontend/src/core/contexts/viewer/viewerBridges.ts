import { SpreadMode } from '@embedpdf/plugin-spread/react';
import { PdfBookmarkObject, PdfAttachmentObject } from '@embedpdf/models';

export enum PdfPermissionFlag {
  Print = 0x0004,
  ModifyContents = 0x0008,
  CopyContents = 0x0010,
  ModifyAnnotations = 0x0020,
  FillForms = 0x0100,
  ExtractForAccessibility = 0x0200,
  AssembleDocument = 0x0400,
  PrintHighQuality = 0x0800,
  AllowAll = 0x0f3c,
}

export interface DocumentPermissionsState {
  isEncrypted: boolean;
  isOwnerUnlocked: boolean;
  permissions: number;
  canPrint: boolean;
  canModifyContents: boolean;
  canCopyContents: boolean;
  canModifyAnnotations: boolean;
  canFillForms: boolean;
  canExtractForAccessibility: boolean;
  canAssembleDocument: boolean;
  canPrintHighQuality: boolean;
}

export interface DocumentPermissionsAPIWrapper {
  hasPermission: (flag: PdfPermissionFlag) => boolean;
  hasAllPermissions: (flags: PdfPermissionFlag[]) => boolean;
  getEffectivePermission: (flag: PdfPermissionFlag) => boolean;
}

export interface ScrollAPIWrapper {
  scrollToPage: (params: { pageNumber: number; behavior?: ScrollBehavior }) => void;
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
  makePanDefault: () => void;
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
  SpreadMode: typeof SpreadMode;
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
  goToResult: (index: number) => void;
}

export interface PrintAPIWrapper {
  print: () => void;
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

export interface BookmarkAPIWrapper {
  fetchBookmarks: () => Promise<PdfBookmarkObject[]>;
  clearBookmarks: () => void;
  setLocalBookmarks: (bookmarks: PdfBookmarkObject[] | null, error?: string | null) => void;
}

export interface AttachmentAPIWrapper {
  getAttachments: () => Promise<PdfAttachmentObject[]>;
  downloadAttachment: (attachment: PdfAttachmentObject) => void;
  clearAttachments: () => void;
  setLocalAttachments: (attachments: PdfAttachmentObject[] | null, error?: string | null) => void;
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

export interface BookmarkState {
  bookmarks: PdfBookmarkObject[] | null;
  isLoading: boolean;
  error: string | null;
}

export interface AttachmentState {
  attachments: PdfAttachmentObject[] | null;
  isLoading: boolean;
  error: string | null;
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
  bookmark: BookmarkState;
  attachment: AttachmentState;
  print: unknown;
  permissions: DocumentPermissionsState;
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
  bookmark: BookmarkAPIWrapper;
  attachment: AttachmentAPIWrapper;
  print: PrintAPIWrapper;
  permissions: DocumentPermissionsAPIWrapper;
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
  bookmark: null,
  attachment: null,
  print: null,
  permissions: null,
});

export function registerBridge<K extends BridgeKey>(
  registry: ViewerBridgeRegistry,
  type: K,
  ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]>
): void {
  registry[type] = ref as ViewerBridgeRegistry[K];
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
