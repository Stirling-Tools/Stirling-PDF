/** Structural test-only types for the PDF text editor Playwright specs. */

/** Affine matrix on runs/images. */
export interface EditorMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e?: number;
  f?: number;
}

/** Axis-aligned bounds; `right` appears on per-line merged bounds. */
export interface EditorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
}

export interface EditorLineSlot {
  mergedFromBounds: EditorBounds[];
}

export interface EditorRun {
  id: string;
  text: string;
  locked: boolean;
  fontId: string;
  fontSize: number;
  fontSubset: boolean;
  matrix: EditorMatrix;
  bounds: EditorBounds;
  pdfiumObjPtr: number;
  paragraphLeafPtrs: number[];
  mergedFromPtrs: number[];
  paragraphLineSlots?: EditorLineSlot[];
  /** Inferred letter-spacing (Tc footprint) in PDF points. */
  charSpacingPt: number;
  /** Glyph outline state; null when the run paints no outline. */
  stroke: { r: number; g: number; b: number; a: number } | null;
  strokeWidth: number;
  /** PDF text render mode (Tr). */
  renderMode: number;
  /** Captured engine pen origins / ends per code unit of `text`. */
  charStartsX: number[] | null;
  charEndsX: number[] | null;
  charPositionsKey: string | null;
  /** Member-line count; > 1 means a multi-line paragraph. */
  paragraphLineCount?: number;
}

export interface EditorImage {
  id: string;
  locked: boolean;
  matrix: EditorMatrix;
}

export interface EditorPage {
  pageIndex: number;
  pagePtr: number;
  width: number;
  runs: EditorRun[];
  images: EditorImage[];
  flushGenerate(module: EditorPdfiumModule): void;
}

export interface EditorDoc {
  module: EditorPdfiumModule;
  page(idx: number): EditorPage;
  loadedPages(): EditorPage[];
}

export interface EditorSelectionValue {
  runIds: string[];
  imageIds: string[];
}

export interface EditorSelection {
  selectOne(id: string): void;
  selectMany(ids: string[]): void;
  selectImage(id: string): void;
  clear(): void;
  value: EditorSelectionValue;
}

export interface EditorHistorySize {
  undo: number;
  redo: number;
}

export interface EditorHistory {
  size(): EditorHistorySize;
}

export interface EditorEditorStore {
  doc: EditorDoc;
  selection: EditorSelection;
  history: EditorHistory;
  resetAll(): void;
}

/** Minimal PDFium WASM surface the specs poke directly. */
export interface EditorPdfiumExports {
  malloc(size: number): number;
  free(ptr: number): void;
}

export interface EditorPdfiumRuntime {
  wasmExports: EditorPdfiumExports;
  getValue(ptr: number, type: string): number;
}

export interface EditorPdfiumModule {
  pdfium: EditorPdfiumRuntime;
  FPDFText_LoadPage(pagePtr: number): number;
  FPDFText_ClosePage(textPagePtr: number): void;
  FPDFPageObj_GetBounds(
    ptr: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
  ): number;
  FPDFPageObj_GetMatrix(ptr: number, matrixPtr: number): number;
  FPDFTextObj_GetText(
    ptr: number,
    textPagePtr: number,
    buf: number,
    len: number,
  ): number;
}

/** Telemetry buffer entry mirrored onto the window during edits. */
export interface EditorCharcodeEvent {
  outcome: string;
  strategy?: string;
  text?: string;
  resolved?: number[];
}

/** The window globals the specs read inside `page.evaluate` closures. */
export interface EditorTestWindow {
  __editor_store: EditorEditorStore;
  __charcode_events?: EditorCharcodeEvent[];
}
