/** Structural test-only types for the v2 PDF text editor Playwright specs. */

/** Affine matrix on runs/images. */
export interface V2Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e?: number;
  f?: number;
}

/** Axis-aligned bounds; `right` appears on per-line merged bounds. */
export interface V2Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
}

export interface V2LineSlot {
  mergedFromBounds: V2Bounds[];
}

export interface V2Run {
  id: string;
  text: string;
  locked: boolean;
  fontId: string;
  fontSize: number;
  fontSubset: boolean;
  matrix: V2Matrix;
  bounds: V2Bounds;
  pdfiumObjPtr: number;
  paragraphLeafPtrs: number[];
  mergedFromPtrs: number[];
  paragraphLineSlots?: V2LineSlot[];
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

export interface V2Image {
  id: string;
  locked: boolean;
  matrix: V2Matrix;
}

export interface V2Page {
  pageIndex: number;
  pagePtr: number;
  width: number;
  runs: V2Run[];
  images: V2Image[];
  flushGenerate(module: V2PdfiumModule): void;
}

export interface V2Doc {
  module: V2PdfiumModule;
  page(idx: number): V2Page;
  loadedPages(): V2Page[];
}

export interface V2SelectionValue {
  runIds: string[];
  imageIds: string[];
}

export interface V2Selection {
  selectOne(id: string): void;
  selectMany(ids: string[]): void;
  selectImage(id: string): void;
  clear(): void;
  value: V2SelectionValue;
}

export interface V2HistorySize {
  undo: number;
  redo: number;
}

export interface V2History {
  size(): V2HistorySize;
}

export interface V2EditorStore {
  doc: V2Doc;
  selection: V2Selection;
  history: V2History;
  resetAll(): void;
}

/** Minimal PDFium WASM surface the specs poke directly. */
export interface V2PdfiumExports {
  malloc(size: number): number;
  free(ptr: number): void;
}

export interface V2PdfiumRuntime {
  wasmExports: V2PdfiumExports;
  getValue(ptr: number, type: string): number;
}

export interface V2PdfiumModule {
  pdfium: V2PdfiumRuntime;
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
export interface V2CharcodeEvent {
  outcome: string;
  strategy?: string;
  text?: string;
  resolved?: number[];
}

/** The window globals the specs read inside `page.evaluate` closures. */
export interface V2TestWindow {
  __v2_editor_store: V2EditorStore;
  __v2_charcode_events?: V2CharcodeEvent[];
}
