/**
 * pdfiumService — Singleton PDFium WASM engine wrapper.
 *
 * Provides a thin, promise-based API on top of the @embedpdf/pdfium WASM
 * module.  Every other module that used to depend on @cantoo/pdf-lib for
 * low-level PDF object access should import helpers from here instead.
 *
 * The engine is lazily initialised on the first call to `getEngine()`.
 * All PDFium C-API wrappers are available through `WrappedPdfiumModule`.
 *
 * Higher-level helpers (`openDocument`, `closeDocument`, `getPageAnnotations`,
 * `getSignatures`, `saveAsCopy`, …) wrap the `PdfEngine` interface so callers
 * never have to deal with raw pointers or Tasks.
 */
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { FormField, WidgetCoordinates } from "@app/tools/formFill/types";

// PDF form field type constants (matching PDFium C API FPDF_FORMFIELD_* values)
const FPDF_FORMFIELD_UNKNOWN = 0;
const FPDF_FORMFIELD_PUSHBUTTON = 1;
const FPDF_FORMFIELD_CHECKBOX = 2;
const FPDF_FORMFIELD_RADIOBUTTON = 3;
const FPDF_FORMFIELD_COMBOBOX = 4;
const FPDF_FORMFIELD_LISTBOX = 5;
const FPDF_FORMFIELD_TEXTFIELD = 6;
const FPDF_FORMFIELD_SIGNATURE = 7;

/** Form field type enum — mirrors PDFium C API values. */
export const PDF_FORM_FIELD_TYPE = {
  UNKNOWN: FPDF_FORMFIELD_UNKNOWN,
  PUSHBUTTON: FPDF_FORMFIELD_PUSHBUTTON,
  CHECKBOX: FPDF_FORMFIELD_CHECKBOX,
  RADIOBUTTON: FPDF_FORMFIELD_RADIOBUTTON,
  COMBOBOX: FPDF_FORMFIELD_COMBOBOX,
  LISTBOX: FPDF_FORMFIELD_LISTBOX,
  TEXTFIELD: FPDF_FORMFIELD_TEXTFIELD,
  SIGNATURE: FPDF_FORMFIELD_SIGNATURE,
} as const;
export type PDF_FORM_FIELD_TYPE =
  (typeof PDF_FORM_FIELD_TYPE)[keyof typeof PDF_FORM_FIELD_TYPE];

let _initPromise: Promise<WrappedPdfiumModule> | null = null;
let _module: WrappedPdfiumModule | null = null;

/**
 * Resolve the absolute WASM URL using the same pattern as LocalEmbedPDF.
 */
function wasmUrl(): string {
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  return `${base}pdfium/pdfium.wasm`.replace(/\/\//g, "/");
}

/**
 * Get (or lazily initialise) the raw `WrappedPdfiumModule`.
 *
 * This is the low-level PDFium WASM interface with all C functions wrapped.
 * Prefer `withDocument()` for document-scoped work.
 */
export async function getPdfiumModule(): Promise<WrappedPdfiumModule> {
  if (_module) return _module;
  if (!_initPromise) {
    _initPromise = init({
      locateFile: () => wasmUrl(),
    } as any).then((m) => {
      // Call PDFiumExt_Init to ensure extensions (form fill etc.) are set up
      try {
        m.PDFiumExt_Init();
      } catch {
        /* already initialized */
      }
      _module = m;
      return m;
    });
  }
  return _initPromise;
}

/**
 * Reset the singleton module after a fatal WASM error.
 * Next call to getPdfiumModule() will create a fresh instance.
 */
export function resetPdfiumModule(): void {
  _module = null;
  _initPromise = null;
  _docDataPtrs.clear();
}

/**
 * Map of document pointer → WASM data buffer pointer.
 * FPDF_LoadMemDocument does NOT copy the data — it keeps a reference, so the
 * buffer must stay alive until FPDF_CloseDocument is called.
 */
const _docDataPtrs = new Map<number, number>();

/**
 * Read an annotation rectangle using the CropBox-adjusted `EPDFAnnot_GetRect`
 * when available (from @embedpdf's extended pdfium build), falling back to the
 * standard `FPDFAnnot_GetRect` otherwise.
 *
 * The extended version returns coordinates relative to the page's visible
 * (CropBox) area, which matches the coordinate space used by the EmbedPDF
 * renderer.  The standard API returns raw MediaBox coordinates which can be
 * offset when CropBox origin ≠ (0,0).
 *
 * FS_RECTF memory layout: { left (f32), top (f32), right (f32), bottom (f32) }
 * In PDF coords (origin lower-left): top > bottom.
 */
export function readAnnotRectAdjusted(
  m: WrappedPdfiumModule,
  annotPtr: number,
  rectBuf: number,
): boolean {
  const ext = (m as any).EPDFAnnot_GetRect;
  if (typeof ext === "function") {
    return ext.call(m, annotPtr, rectBuf);
  }
  return m.FPDFAnnot_GetRect(annotPtr, rectBuf);
}

/**
 * Parse an FS_RECTF buffer into CSS-space coordinates.
 *
 * FS_RECTF layout: { left, top, right, bottom } (all floats, PDF lower-left origin).
 * Returns { x, y, width, height } in CSS upper-left origin.
 */
export function parseRectToCss(
  m: WrappedPdfiumModule,
  rectBuf: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const left = m.pdfium.getValue(rectBuf, "float");
  const top = m.pdfium.getValue(rectBuf + 4, "float"); // FS_RECTF.top  (larger y)
  const right = m.pdfium.getValue(rectBuf + 8, "float");
  const bottom = m.pdfium.getValue(rectBuf + 12, "float"); // FS_RECTF.bottom (smaller y)

  const pdfLeft = Math.min(left, right);
  const pdfTop = Math.max(top, bottom);
  const pdfWidth = Math.abs(right - left);
  const pdfHeight = Math.abs(top - bottom);

  return {
    x: pdfLeft,
    y: pageHeight - pdfTop, // flip: CSS y = pageHeight − PDF top
    width: pdfWidth,
    height: pdfHeight,
  };
}

/** CropBox / MediaBox coordinates for a page. */
interface PageBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

/**
 * Read the effective visible page box (CropBox if defined, else MediaBox).
 * Falls back to FPDF_GetPageWidthF/HeightF with origin (0,0) if neither is found.
 *
 * The returned values use the standard PDF coordinate system:
 *   left < right, bottom < top, origin at lower-left.
 */
export function readEffectivePageBox(
  m: WrappedPdfiumModule,
  pagePtr: number,
): PageBox {
  const buf = m.pdfium.wasmExports.malloc(4 * 4); // 4 floats

  const read = (): PageBox | null => {
    const l = m.pdfium.getValue(buf, "float");
    const b = m.pdfium.getValue(buf + 4, "float");
    const r = m.pdfium.getValue(buf + 8, "float");
    const t = m.pdfium.getValue(buf + 12, "float");
    const w = Math.abs(r - l);
    const h = Math.abs(t - b);
    if (w < 0.01 || h < 0.01) return null; // degenerate
    return {
      left: Math.min(l, r),
      bottom: Math.min(b, t),
      right: Math.max(l, r),
      top: Math.max(b, t),
    };
  };

  let result: PageBox | null = null;
  try {
    // CropBox is the effective visible area
    if (
      (m as any).FPDFPage_GetCropBox(pagePtr, buf, buf + 4, buf + 8, buf + 12)
    ) {
      result = read();
    }
    // Fall back to MediaBox
    if (
      !result &&
      (m as any).FPDFPage_GetMediaBox(pagePtr, buf, buf + 4, buf + 8, buf + 12)
    ) {
      result = read();
    }
  } catch {
    // If the API calls fail, fall through to dimension fallback
  }

  m.pdfium.wasmExports.free(buf);

  if (!result) {
    // Last resort: assume origin (0,0) and use page dimensions
    return {
      left: 0,
      bottom: 0,
      right: m.FPDF_GetPageWidthF(pagePtr),
      top: m.FPDF_GetPageHeightF(pagePtr),
    };
  }
  return result;
}

/**
 * Copy bytes into WASM heap safely.
 * Creates a fresh Uint8Array view of the WASM memory buffer AFTER malloc
 * so it is never stale even if malloc triggered a memory growth.
 */
function copyToWasmHeap(
  m: WrappedPdfiumModule,
  bytes: Uint8Array,
  ptr: number,
): void {
  new Uint8Array((m.pdfium.wasmExports as any).memory.buffer).set(bytes, ptr);
}

/**
 * Load a PDF into PDFium memory and return the document pointer.
 * Caller MUST call `closeRawDocument(docPtr)` when finished.
 */
export async function openRawDocument(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<number> {
  const m = await getPdfiumModule();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const len = bytes.length;
  const ptr = m.pdfium.wasmExports.malloc(len);
  copyToWasmHeap(m, bytes, ptr);

  const docPtr = m.FPDF_LoadMemDocument(ptr, len, password ?? "");
  if (!docPtr) {
    m.pdfium.wasmExports.free(ptr);
    const err = m.FPDF_GetLastError();
    throw new Error(`PDFium: failed to open document (error ${err})`);
  }
  // Keep the buffer alive — freed in closeRawDocument()
  _docDataPtrs.set(docPtr, ptr);
  return docPtr;
}

/**
 * Open a raw document — convenience alias that delegates to {@link openRawDocument}.
 * Kept for API compatibility with callers that were updated to use the "Safe" variant.
 */
export async function openRawDocumentSafe(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<number> {
  return openRawDocument(data, password);
}

/**
 * Close a raw document pointer and free its backing data buffer.
 */
export async function closeRawDocument(docPtr: number): Promise<void> {
  const m = await getPdfiumModule();
  closeDocAndFreeBuffer(m, docPtr);
}

/**
 * Synchronous close + buffer free — for use inside `finally` blocks that
 * already have the module reference.
 */
export function closeDocAndFreeBuffer(
  m: WrappedPdfiumModule,
  docPtr: number,
): void {
  m.FPDF_CloseDocument(docPtr);
  const dataPtr = _docDataPtrs.get(docPtr);
  if (dataPtr) {
    m.pdfium.wasmExports.free(dataPtr);
    _docDataPtrs.delete(docPtr);
  }
}

/**
 * Get page count for a raw document pointer.
 */
export async function getRawPageCount(docPtr: number): Promise<number> {
  const m = await getPdfiumModule();
  return m.FPDF_GetPageCount(docPtr);
}

/**
 * Get raw page dimensions { width, height } for a page.
 */
export async function getRawPageSize(
  docPtr: number,
  pageIndex: number,
): Promise<{ width: number; height: number }> {
  const m = await getPdfiumModule();
  const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
  if (!pagePtr) throw new Error(`PDFium: failed to load page ${pageIndex}`);
  const width = m.FPDF_GetPageWidthF(pagePtr);
  const height = m.FPDF_GetPageHeightF(pagePtr);
  m.FPDF_ClosePage(pagePtr);
  return { width, height };
}

/**
 * Read a UTF-16LE string from PDFium memory at the given pointer up to `len`
 * bytes (including the trailing NUL pair).
 */
export function readUtf16(
  m: WrappedPdfiumModule,
  ptr: number,
  byteLen: number,
): string {
  if (byteLen <= 2 || !ptr) return "";
  return m.pdfium.UTF16ToString(ptr);
}

/**
 * Allocate a UTF-16LE buffer in WASM memory, write the string, and return the
 * pointer.  Caller must free with `m.pdfium.wasmExports.free(ptr)`.
 */
export function writeUtf16(m: WrappedPdfiumModule, str: string): number {
  // UTF-16 encodes each char as 2 bytes + 2-byte NUL terminator
  const byteLen = (str.length + 1) * 2;
  const ptr = m.pdfium.wasmExports.malloc(byteLen);
  m.pdfium.stringToUTF16(str, ptr, byteLen);
  return ptr;
}

export interface PdfiumFormField {
  name: string;
  type: PDF_FORM_FIELD_TYPE;
  value: string;
  isChecked: boolean;
  isReadOnly: boolean;
  isRequired: boolean;
  /** Raw PDF field flags bitmask (from FPDFAnnot_GetFormFieldFlags). */
  flags: number;
  options: Array<{ label: string; isSelected: boolean }>;
  widgets: PdfiumWidgetRect[];
}

export interface PdfiumWidgetRect {
  pageIndex: number;
  x: number; // CSS upper-left origin (after y-flip)
  y: number;
  width: number;
  height: number;
  exportValue?: string;
  fontSize?: number;
  /** Whether this specific widget is checked (radio/checkbox only). */
  isChecked?: boolean;
}

/**
 * Extract all form fields (Widget annotations) from every page of a document.
 *
 * Returns an array of parsed form fields with their widget rectangles already
 * converted to CSS coordinate space (upper-left origin).
 */
export async function extractFormFields(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<PdfiumFormField[]> {
  const m = await getPdfiumModule();
  let docPtr: number;
  try {
    docPtr = await openRawDocumentSafe(data, password);
  } catch (err) {
    console.error("[extractFormFields] openRawDocumentSafe failed:", err);
    if (err instanceof WebAssembly.RuntimeError) resetPdfiumModule();
    throw err;
  }

  try {
    // Init form fill environment
    const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
    const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(docPtr, formInfoPtr);

    const pageCount = m.FPDF_GetPageCount(docPtr);
    console.debug(
      "[extractFormFields] docPtr=%d formEnvPtr=%d pageCount=%d dataSize=%d",
      docPtr,
      formEnvPtr,
      pageCount,
      data instanceof Uint8Array ? data.length : data.byteLength,
    );
    // Map: fieldName → PdfiumFormField (to merge widgets across pages)
    const fieldMap = new Map<string, PdfiumFormField>();

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      let pagePtr: number;
      try {
        pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
      } catch (err) {
        console.warn(
          "[extractFormFields] FPDF_LoadPage crashed for page",
          pageIdx,
          err,
        );
        if (err instanceof WebAssembly.RuntimeError) {
          resetPdfiumModule();
          throw err;
        }
        continue;
      }
      if (!pagePtr) {
        console.warn(
          "[extractFormFields] FPDF_LoadPage returned 0 for page",
          pageIdx,
        );
        continue;
      }

      // Notify form system about the page
      if (formEnvPtr) {
        try {
          m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);
        } catch (err) {
          console.warn(
            "[extractFormFields] FORM_OnAfterLoadPage crashed for page",
            pageIdx,
            err,
          );
        }
      }

      // Read effective page box (CropBox if available, else MediaBox)
      // Mirrors PDFBox's page.getCropBox() approach for coordinate adjustment.
      const pageBox = readEffectivePageBox(m, pagePtr);
      const cropWidth = pageBox.right - pageBox.left;
      const cropHeight = pageBox.top - pageBox.bottom;
      const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

      if (pageIdx === 0) {
        console.debug(
          "[extractFormFields] page 0 box: left=%.2f bottom=%.2f right=%.2f top=%.2f  cropW=%.2f cropH=%.2f  FPDF_H=%.2f",
          pageBox.left,
          pageBox.bottom,
          pageBox.right,
          pageBox.top,
          cropWidth,
          cropHeight,
          m.FPDF_GetPageHeightF(pagePtr),
        );
      }

      for (let annotIdx = 0; annotIdx < annotCount; annotIdx++) {
        try {
          this_extractAnnotation(
            m,
            formEnvPtr,
            pagePtr,
            pageIdx,
            pageBox,
            cropWidth,
            cropHeight,
            annotIdx,
            fieldMap,
          );
        } catch (annotErr) {
          console.warn(
            "[extractFormFields] Annotation %d on page %d crashed:",
            annotIdx,
            pageIdx,
            annotErr,
          );
        }
      }

      if (formEnvPtr) {
        try {
          m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
        } catch {
          /* best-effort */
        }
      }
      try {
        m.FPDF_ClosePage(pagePtr);
      } catch {
        /* best-effort */
      }
    }

    // Cleanup form environment
    if (formEnvPtr) {
      try {
        m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
      } catch {
        /* */
      }
    }
    if (formInfoPtr) {
      try {
        m.PDFiumExt_CloseFormFillInfo(formInfoPtr);
      } catch {
        /* */
      }
    }

    console.debug("[extractFormFields] Extracted %d fields", fieldMap.size);
    return Array.from(fieldMap.values());
  } catch (err) {
    if (err instanceof WebAssembly.RuntimeError) {
      console.error(
        "[extractFormFields] WASM RuntimeError — resetting module:",
        err,
      );
      resetPdfiumModule();
    }
    throw err;
  } finally {
    try {
      closeDocAndFreeBuffer(m, docPtr);
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Process a single annotation and merge into fieldMap.
 * Extracted as a helper so that extractFormFields can catch per-annotation WASM traps.
 *
 * Coordinate conversion mirrors the Java PDFBox backend exactly:
 *   relativeX = annotLeft − cropBox.left
 *   relativeY = annotBottom − cropBox.bottom
 *   cssX = relativeX
 *   cssY = cropHeight − relativeY − annotHeight
 */
function this_extractAnnotation(
  m: WrappedPdfiumModule,
  formEnvPtr: number,
  pagePtr: number,
  pageIdx: number,
  pageBox: PageBox,
  _cropWidth: number,
  cropHeight: number,
  annotIdx: number,
  fieldMap: Map<string, PdfiumFormField>,
): void {
  const annotPtr = m.FPDFPage_GetAnnot(pagePtr, annotIdx);
  if (!annotPtr) return;

  try {
    const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
    // FPDF_ANNOT_WIDGET = 20
    if (subtype !== 20) return;

    // Get form field type
    const fieldType = formEnvPtr
      ? m.FPDFAnnot_GetFormFieldType(formEnvPtr, annotPtr)
      : 0;

    // Get field name (requires a valid form environment pointer)
    const nameLen = formEnvPtr
      ? m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, 0, 0)
      : 0;
    let fieldName = "";
    if (nameLen > 0) {
      const nameBuf = m.pdfium.wasmExports.malloc(nameLen);
      m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nameBuf, nameLen);
      fieldName = readUtf16(m, nameBuf, nameLen);
      m.pdfium.wasmExports.free(nameBuf);
    }

    // Get field value (requires a valid form environment pointer)
    const valLen = formEnvPtr
      ? m.FPDFAnnot_GetFormFieldValue(formEnvPtr, annotPtr, 0, 0)
      : 0;
    let fieldValue = "";
    if (valLen > 0) {
      const valBuf = m.pdfium.wasmExports.malloc(valLen);
      m.FPDFAnnot_GetFormFieldValue(formEnvPtr, annotPtr, valBuf, valLen);
      fieldValue = readUtf16(m, valBuf, valLen);
      m.pdfium.wasmExports.free(valBuf);
    }

    // Get field flags (requires a valid form environment pointer)
    const fieldFlags = formEnvPtr
      ? m.FPDFAnnot_GetFormFieldFlags(formEnvPtr, annotPtr)
      : 0;
    const isReadOnly = (fieldFlags & 1) !== 0; // FORMFLAG_READONLY = 1
    const isRequired = (fieldFlags & 2) !== 0; // FORMFLAG_REQUIRED = 2

    // Is checked (for checkboxes/radios)
    const isChecked = formEnvPtr
      ? m.FPDFAnnot_IsChecked(formEnvPtr, annotPtr)
      : false;

    // Get rect using standard FPDFAnnot_GetRect for known struct layout,
    // then apply explicit CropBox adjustment (mirrors the Java PDFBox backend).
    // Standard FS_RECTF layout: { left(f32), bottom(f32), right(f32), top(f32) }
    const rectBuf = m.pdfium.wasmExports.malloc(4 * 4); // FS_RECTF = 4 floats
    let hasRect = false;
    try {
      hasRect = m.FPDFAnnot_GetRect(annotPtr, rectBuf);
    } catch {
      m.pdfium.wasmExports.free(rectBuf);
      throw new Error("FPDFAnnot_GetRect crashed");
    }

    let widgetRect: PdfiumWidgetRect | null = null;
    if (hasRect) {
      // Standard FS_RECTF: {left, bottom, right, top} — raw MediaBox coordinates
      const rawLeft = m.pdfium.getValue(rectBuf, "float");
      const rawBottom = m.pdfium.getValue(rectBuf + 4, "float");
      const rawRight = m.pdfium.getValue(rectBuf + 8, "float");
      const rawTop = m.pdfium.getValue(rectBuf + 12, "float");

      const annotLeft = Math.min(rawLeft, rawRight);
      const annotBottom = Math.min(rawBottom, rawTop);
      const annotRight = Math.max(rawLeft, rawRight);
      const annotTop = Math.max(rawBottom, rawTop);
      const pdfW = annotRight - annotLeft;
      const pdfH = annotTop - annotBottom;

      // Adjust relative to CropBox origin (identical to PDFBox approach)
      const relativeX = annotLeft - pageBox.left;
      const relativeY = annotBottom - pageBox.bottom;

      // Y-flip: CSS upper-left origin, using CropBox height
      const cssX = relativeX;
      const cssY = cropHeight - relativeY - pdfH;

      // Diagnostic log for first annotation on first page
      if (pageIdx === 0 && annotIdx < 2) {
        console.debug(
          "[extractFormFields] annot[%d] raw rect: L=%.2f B=%.2f R=%.2f T=%.2f → css: x=%.2f y=%.2f w=%.2f h=%.2f (cropAdj: relX=%.2f relY=%.2f)",
          annotIdx,
          annotLeft,
          annotBottom,
          annotRight,
          annotTop,
          cssX,
          cssY,
          pdfW,
          pdfH,
          relativeX,
          relativeY,
        );
      }

      widgetRect = {
        pageIndex: pageIdx,
        x: cssX,
        y: cssY,
        width: pdfW,
        height: pdfH,
      };

      // Get font size from default appearance
      try {
        const daLen = m.FPDFAnnot_GetStringValue(annotPtr, "DA", 0, 0);
        if (daLen > 0) {
          const daBuf = m.pdfium.wasmExports.malloc(daLen);
          m.FPDFAnnot_GetStringValue(annotPtr, "DA", daBuf, daLen);
          const daStr = readUtf16(m, daBuf, daLen);
          m.pdfium.wasmExports.free(daBuf);
          const tfMatch = daStr.match(/(\d+(?:\.\d+)?)\s+Tf/);
          if (tfMatch) {
            const fs = parseFloat(tfMatch[1]);
            if (fs > 0) widgetRect.fontSize = fs;
          }
        }
      } catch {
        // DA extraction is non-critical
      }

      // Get export value and checked state for checkbox/radio
      if (
        fieldType === PDF_FORM_FIELD_TYPE.CHECKBOX ||
        fieldType === PDF_FORM_FIELD_TYPE.RADIOBUTTON
      ) {
        try {
          const expLen = m.FPDFAnnot_GetFormFieldExportValue(
            formEnvPtr,
            annotPtr,
            0,
            0,
          );
          if (expLen > 0) {
            const expBuf = m.pdfium.wasmExports.malloc(expLen);
            m.FPDFAnnot_GetFormFieldExportValue(
              formEnvPtr,
              annotPtr,
              expBuf,
              expLen,
            );
            widgetRect.exportValue = readUtf16(m, expBuf, expLen);
            m.pdfium.wasmExports.free(expBuf);
          }
        } catch {
          // Export value extraction is non-critical
        }
        widgetRect.isChecked = isChecked;
      }
    }
    m.pdfium.wasmExports.free(rectBuf);

    // Get options (for combo/list/radio)
    const options: Array<{ label: string; isSelected: boolean }> = [];
    if (
      fieldType === PDF_FORM_FIELD_TYPE.COMBOBOX ||
      fieldType === PDF_FORM_FIELD_TYPE.LISTBOX ||
      fieldType === PDF_FORM_FIELD_TYPE.RADIOBUTTON
    ) {
      try {
        const optCount = m.FPDFAnnot_GetOptionCount(formEnvPtr, annotPtr);
        for (let oi = 0; oi < optCount; oi++) {
          const optLabelLen = m.FPDFAnnot_GetOptionLabel(
            formEnvPtr,
            annotPtr,
            oi,
            0,
            0,
          );
          let optLabel = "";
          if (optLabelLen > 0) {
            const optBuf = m.pdfium.wasmExports.malloc(optLabelLen);
            m.FPDFAnnot_GetOptionLabel(
              formEnvPtr,
              annotPtr,
              oi,
              optBuf,
              optLabelLen,
            );
            optLabel = readUtf16(m, optBuf, optLabelLen);
            m.pdfium.wasmExports.free(optBuf);
          }
          const isSel = m.FPDFAnnot_IsOptionSelected(formEnvPtr, annotPtr, oi);
          options.push({ label: optLabel, isSelected: isSel });
        }
      } catch {
        // Options extraction non-critical
      }
    }

    // Merge into field map (multiple widgets can share a field name)
    if (fieldName) {
      const existing = fieldMap.get(fieldName);
      if (existing) {
        if (widgetRect) existing.widgets.push(widgetRect);
      } else {
        fieldMap.set(fieldName, {
          name: fieldName,
          type: fieldType as PDF_FORM_FIELD_TYPE,
          value: fieldValue,
          isChecked,
          isReadOnly,
          isRequired,
          flags: fieldFlags,
          options,
          widgets: widgetRect ? [widgetRect] : [],
        });
      }
    }
  } finally {
    m.FPDFPage_CloseAnnot(annotPtr);
  }
}

export interface PdfiumSignature {
  /** Raw DER-encoded PKCS#7 contents */
  contents: Uint8Array;
  /** ByteRange array */
  byteRange: number[];
  /** SubFilter string (e.g. "adbe.pkcs7.detached") */
  subFilter: string;
  /** Reason string */
  reason: string;
  /** Time string (PDF date format: D:YYYYMMDDHHmmSS...) */
  time: string;
  /** DocMDP permission level */
  docMDP: number;
}

/**
 * Extract digital signature objects from a PDF.
 */
export async function extractSignatures(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<PdfiumSignature[]> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const sigCount = m.FPDF_GetSignatureCount(docPtr);
    const results: PdfiumSignature[] = [];

    for (let i = 0; i < sigCount; i++) {
      const sigPtr = m.FPDF_GetSignatureObject(docPtr, i);
      if (!sigPtr) continue;

      // Contents
      const contentsLen = m.FPDFSignatureObj_GetContents(sigPtr, 0, 0);
      let contents = new Uint8Array(0);
      if (contentsLen > 0) {
        const buf = m.pdfium.wasmExports.malloc(contentsLen);
        m.FPDFSignatureObj_GetContents(sigPtr, buf, contentsLen);
        contents = new Uint8Array(contentsLen);
        for (let j = 0; j < contentsLen; j++) {
          contents[j] = m.pdfium.getValue(buf + j, "i8") & 0xff;
        }
        m.pdfium.wasmExports.free(buf);
      }

      // ByteRange
      const brLen = m.FPDFSignatureObj_GetByteRange(sigPtr, 0, 0);
      const byteRange: number[] = [];
      if (brLen > 0) {
        const brBuf = m.pdfium.wasmExports.malloc(brLen * 4);
        m.FPDFSignatureObj_GetByteRange(sigPtr, brBuf, brLen);
        for (let j = 0; j < brLen; j++) {
          byteRange.push(m.pdfium.getValue(brBuf + j * 4, "i32"));
        }
        m.pdfium.wasmExports.free(brBuf);
      }

      // SubFilter
      const sfLen = m.FPDFSignatureObj_GetSubFilter(sigPtr, 0, 0);
      let subFilter = "";
      if (sfLen > 0) {
        const sfBuf = m.pdfium.wasmExports.malloc(sfLen);
        m.FPDFSignatureObj_GetSubFilter(sigPtr, sfBuf, sfLen);
        subFilter = m.pdfium.UTF8ToString(sfBuf);
        m.pdfium.wasmExports.free(sfBuf);
      }

      // Reason
      const reasonLen = m.FPDFSignatureObj_GetReason(sigPtr, 0, 0);
      let reason = "";
      if (reasonLen > 0) {
        const reasonBuf = m.pdfium.wasmExports.malloc(reasonLen);
        m.FPDFSignatureObj_GetReason(sigPtr, reasonBuf, reasonLen);
        reason = readUtf16(m, reasonBuf, reasonLen);
        m.pdfium.wasmExports.free(reasonBuf);
      }

      // Time
      const timeLen = m.FPDFSignatureObj_GetTime(sigPtr, 0, 0);
      let time = "";
      if (timeLen > 0) {
        const timeBuf = m.pdfium.wasmExports.malloc(timeLen);
        m.FPDFSignatureObj_GetTime(sigPtr, timeBuf, timeLen);
        time = m.pdfium.UTF8ToString(timeBuf);
        m.pdfium.wasmExports.free(timeBuf);
      }

      // DocMDP
      const docMDP = m.FPDFSignatureObj_GetDocMDPPermission(sigPtr);

      results.push({ contents, byteRange, subFilter, reason, time, docMDP });
    }

    return results;
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Render a single page to an ImageData-like bitmap.
 */
export async function renderPageToBitmap(
  data: ArrayBuffer | Uint8Array,
  pageIndex: number,
  scale: number = 1,
  password?: string,
): Promise<ImageData> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) throw new Error(`PDFium: failed to load page ${pageIndex}`);

    const rawW = m.FPDF_GetPageWidthF(pagePtr);
    const rawH = m.FPDF_GetPageHeightF(pagePtr);
    const w = Math.round(rawW * scale);
    const h = Math.round(rawH * scale);

    // Create bitmap (BGRA format = 4)
    const bitmapPtr = m.FPDFBitmap_Create(w, h, 1);
    // Fill with white
    m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, w, h, 0xffffffff);

    // Render
    m.FPDF_RenderPageBitmap(bitmapPtr, pagePtr, 0, 0, w, h, 0, 0x01 | 0x10);

    // Read pixel data
    const bufferPtr = m.FPDFBitmap_GetBuffer(bitmapPtr);
    const stride = m.FPDFBitmap_GetStride(bitmapPtr);
    const pixelData = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcOff = y * stride + x * 4;
        const dstOff = (y * w + x) * 4;
        // BGRA → RGBA
        pixelData[dstOff] =
          m.pdfium.getValue(bufferPtr + srcOff + 2, "i8") & 0xff;
        pixelData[dstOff + 1] =
          m.pdfium.getValue(bufferPtr + srcOff + 1, "i8") & 0xff;
        pixelData[dstOff + 2] =
          m.pdfium.getValue(bufferPtr + srcOff, "i8") & 0xff;
        pixelData[dstOff + 3] =
          m.pdfium.getValue(bufferPtr + srcOff + 3, "i8") & 0xff;
      }
    }

    m.FPDFBitmap_Destroy(bitmapPtr);
    m.FPDF_ClosePage(pagePtr);

    return new ImageData(pixelData, w, h);
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

export interface PdfiumLink {
  id: string;
  annotIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  type: "internal" | "external" | "unknown";
  targetPage?: number;
  uri?: string;
}

/**
 * Extract all link annotations from a specific page.
 */
export async function extractLinksFromPage(
  data: ArrayBuffer | Uint8Array,
  pageIndex: number,
  password?: string,
): Promise<{ links: PdfiumLink[]; pageWidth: number; pageHeight: number }> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) return { links: [], pageWidth: 0, pageHeight: 0 };

    const pageWidth = m.FPDF_GetPageWidthF(pagePtr);
    const pageHeight = m.FPDF_GetPageHeightF(pagePtr);

    const links: PdfiumLink[] = [];
    const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

    for (let i = 0; i < annotCount; i++) {
      const annotPtr = m.FPDFPage_GetAnnot(pagePtr, i);
      if (!annotPtr) continue;

      const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
      // FPDF_ANNOT_LINK = 4
      if (subtype !== 4) {
        m.FPDFPage_CloseAnnot(annotPtr);
        continue;
      }

      // Get rect (CropBox-adjusted for correct overlay positioning)
      const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
      const hasRect = readAnnotRectAdjusted(m, annotPtr, rectBuf);
      if (!hasRect) {
        m.pdfium.wasmExports.free(rectBuf);
        m.FPDFPage_CloseAnnot(annotPtr);
        continue;
      }

      const rect = parseRectToCss(m, rectBuf, pageHeight);
      m.pdfium.wasmExports.free(rectBuf);

      // Try to get link object
      const linkPtr = m.FPDFAnnot_GetLink(annotPtr);
      let linkType: "internal" | "external" | "unknown" = "unknown";
      let targetPage: number | undefined;
      let uri: string | undefined;

      if (linkPtr) {
        // Check for URI action
        const actionPtr = m.FPDFLink_GetAction(linkPtr);
        if (actionPtr) {
          const actionType = m.FPDFAction_GetType(actionPtr);
          if (actionType === 3) {
            // PDFACTION_URI = 3
            const uriLen = m.FPDFAction_GetURIPath(docPtr, actionPtr, 0, 0);
            if (uriLen > 0) {
              const uriBuf = m.pdfium.wasmExports.malloc(uriLen);
              m.FPDFAction_GetURIPath(docPtr, actionPtr, uriBuf, uriLen);
              uri = m.pdfium.UTF8ToString(uriBuf);
              m.pdfium.wasmExports.free(uriBuf);
              linkType = "external";
            }
          } else if (actionType === 1) {
            // PDFACTION_GOTO = 1
            const destPtr = m.FPDFAction_GetDest(docPtr, actionPtr);
            if (destPtr) {
              targetPage = m.FPDFDest_GetDestPageIndex(docPtr, destPtr);
              linkType = "internal";
            }
          }
        }

        // Check for direct destination (no action)
        if (linkType === "unknown") {
          const destPtr = m.FPDFLink_GetDest(docPtr, linkPtr);
          if (destPtr) {
            targetPage = m.FPDFDest_GetDestPageIndex(docPtr, destPtr);
            linkType = "internal";
          }
        }
      }

      links.push({
        id: `link-${pageIndex}-${i}`,
        annotIndex: i,
        rect,
        type: linkType,
        targetPage,
        uri,
      });

      m.FPDFPage_CloseAnnot(annotPtr);
    }

    m.FPDF_ClosePage(pagePtr);
    return { links, pageWidth, pageHeight };
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Create a new empty PDF document, returning its raw data.
 */
export async function createEmptyDocument(): Promise<ArrayBuffer> {
  const m = await getPdfiumModule();
  const docPtr = m.FPDF_CreateNewDocument();
  if (!docPtr) throw new Error("PDFium: failed to create new document");
  const writerPtr = m.PDFiumExt_OpenFileWriter();
  m.PDFiumExt_SaveAsCopy(docPtr, writerPtr);
  const size = m.PDFiumExt_GetFileWriterSize(writerPtr);
  const outBuf = m.pdfium.wasmExports.malloc(size);
  m.PDFiumExt_GetFileWriterData(writerPtr, outBuf, size);
  const result = new ArrayBuffer(size);
  const view = new Uint8Array(result);
  for (let i = 0; i < size; i++) {
    view[i] = m.pdfium.getValue(outBuf + i, "i8") & 0xff;
  }
  m.pdfium.wasmExports.free(outBuf);
  m.PDFiumExt_CloseFileWriter(writerPtr);
  closeDocAndFreeBuffer(m, docPtr);
  return result;
}

/**
 * Save a raw document pointer to an ArrayBuffer.
 */
export async function saveRawDocument(docPtr: number): Promise<ArrayBuffer> {
  const m = await getPdfiumModule();
  const writerPtr = m.PDFiumExt_OpenFileWriter();
  m.PDFiumExt_SaveAsCopy(docPtr, writerPtr);
  const size = m.PDFiumExt_GetFileWriterSize(writerPtr);
  const outBuf = m.pdfium.wasmExports.malloc(size);
  m.PDFiumExt_GetFileWriterData(writerPtr, outBuf, size);
  const result = new ArrayBuffer(size);
  const view = new Uint8Array(result);
  for (let i = 0; i < size; i++) {
    view[i] = m.pdfium.getValue(outBuf + i, "i8") & 0xff;
  }
  m.pdfium.wasmExports.free(outBuf);
  m.PDFiumExt_CloseFileWriter(writerPtr);
  return result;
}

/**
 * Import pages from one PDF document into another.
 * Both source and dest must already be opened with `openRawDocumentSafe()`.
 */
export async function importPages(
  destDocPtr: number,
  srcDocPtr: number,
  pageRange?: string,
  insertIndex?: number,
): Promise<boolean> {
  const m = await getPdfiumModule();
  return m.FPDF_ImportPages(
    destDocPtr,
    srcDocPtr,
    pageRange ?? "",
    insertIndex ?? 0,
  );
}

/**
 * Set page rotation on a raw document.
 * @param rotation 0, 1, 2, 3 for 0°, 90°, 180°, 270°
 */
export async function setPageRotation(
  docPtr: number,
  pageIndex: number,
  rotation: number,
): Promise<void> {
  const m = await getPdfiumModule();
  const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
  if (!pagePtr) throw new Error(`PDFium: failed to load page ${pageIndex}`);
  m.FPDFPage_SetRotation(pagePtr, rotation);
  m.FPDF_ClosePage(pagePtr);
}

/**
 * Create a new page in a document.
 */
export async function addNewPage(
  docPtr: number,
  insertIndex: number,
  width: number,
  height: number,
): Promise<void> {
  const m = await getPdfiumModule();
  const pagePtr = m.FPDFPage_New(docPtr, insertIndex, width, height);
  if (pagePtr) m.FPDF_ClosePage(pagePtr);
}

/**
 * Get metadata from a document.
 */
export async function getMetadata(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<Record<string, string>> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);
  try {
    const tags = [
      "Title",
      "Author",
      "Subject",
      "Keywords",
      "Creator",
      "Producer",
    ];
    const meta: Record<string, string> = {};
    for (const tag of tags) {
      const len = m.FPDF_GetMetaText(docPtr, tag, 0, 0);
      if (len > 0) {
        const buf = m.pdfium.wasmExports.malloc(len);
        m.FPDF_GetMetaText(docPtr, tag, buf, len);
        meta[tag] = readUtf16(m, buf, len);
        m.pdfium.wasmExports.free(buf);
      }
    }
    return meta;
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

export interface PdfiumSignatureFieldRect {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldName: string;
}

/**
 * Extract the visual rectangles of signature form fields.
 * These are the Widget annotations whose form field type is SIGNATURE.
 */
export async function extractSignatureFieldRects(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<PdfiumSignatureFieldRect[]> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);
  try {
    const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
    const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(docPtr, formInfoPtr);
    const pageCount = m.FPDF_GetPageCount(docPtr);
    const results: PdfiumSignatureFieldRect[] = [];

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
      if (!pagePtr) continue;
      if (formEnvPtr) m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);

      // Use CropBox-adjusted coordinates (same approach as extractFormFields)
      const pageBox = readEffectivePageBox(m, pagePtr);
      const cropHeight = pageBox.top - pageBox.bottom;
      const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

      for (let annotIdx = 0; annotIdx < annotCount; annotIdx++) {
        const annotPtr = m.FPDFPage_GetAnnot(pagePtr, annotIdx);
        if (!annotPtr) continue;

        const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
        if (subtype !== 20) {
          // WIDGET
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        const fieldType = formEnvPtr
          ? m.FPDFAnnot_GetFormFieldType(formEnvPtr, annotPtr)
          : 0;

        if (fieldType !== PDF_FORM_FIELD_TYPE.SIGNATURE) {
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        // Get field name
        const nameLen = m.FPDFAnnot_GetFormFieldName(
          formEnvPtr,
          annotPtr,
          0,
          0,
        );
        let name = "";
        if (nameLen > 0) {
          const nameBuf = m.pdfium.wasmExports.malloc(nameLen);
          m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nameBuf, nameLen);
          name = readUtf16(m, nameBuf, nameLen);
          m.pdfium.wasmExports.free(nameBuf);
        }

        // Get rect — use standard FPDFAnnot_GetRect + CropBox adjustment
        const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
        const hasRect = m.FPDFAnnot_GetRect(annotPtr, rectBuf);
        if (hasRect) {
          const rawLeft = m.pdfium.getValue(rectBuf, "float");
          const rawBottom = m.pdfium.getValue(rectBuf + 4, "float");
          const rawRight = m.pdfium.getValue(rectBuf + 8, "float");
          const rawTop = m.pdfium.getValue(rectBuf + 12, "float");

          const aLeft = Math.min(rawLeft, rawRight);
          const aBottom = Math.min(rawBottom, rawTop);
          const aRight = Math.max(rawLeft, rawRight);
          const aTop = Math.max(rawBottom, rawTop);
          const pdfW = aRight - aLeft;
          const pdfH = aTop - aBottom;

          const relX = aLeft - pageBox.left;
          const relY = aBottom - pageBox.bottom;

          results.push({
            pageIndex: pageIdx,
            x: relX,
            y: cropHeight - relY - pdfH,
            width: pdfW,
            height: pdfH,
            fieldName: name,
          });
        }
        m.pdfium.wasmExports.free(rectBuf);
        m.FPDFPage_CloseAnnot(annotPtr);
      }

      if (formEnvPtr) m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
      m.FPDF_ClosePage(pagePtr);
    }

    if (formEnvPtr) m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
    if (formInfoPtr) m.PDFiumExt_CloseFormFillInfo(formInfoPtr);

    return results;
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/* ------------------------------------------------------------------ */
/*  Signature appearance bitmap rendering                             */
/* ------------------------------------------------------------------ */

/** Result from rendering a single signature widget's visual appearance. */
export interface SignatureFieldAppearance {
  pageIndex: number;
  /** CSS x position (PDF points, CropBox-adjusted). */
  x: number;
  /** CSS y position (PDF points, CropBox-adjusted, top-left origin). */
  y: number;
  /** Width in PDF points. */
  width: number;
  /** Height in PDF points. */
  height: number;
  fieldName: string;
  /**
   * RGBA pixel data of the rendered appearance stream, or `null` when the
   * annotation has no visible appearance (e.g. unsigned fields).
   */
  imageData: ImageData | null;
  /** Source PDF page width (points) used for coordinate computation. */
  sourcePageWidth: number;
  /** Source PDF page height (points) used for coordinate computation. */
  sourcePageHeight: number;
}

/** FPDF_REVERSE_BYTE_ORDER — causes PDFium to output RGBA instead of BGRA. */
const RENDER_FLAG_REVERSE_BYTE_ORDER = 0x10;
/** AppearanceMode.Normal = 0 in @embedpdf/models. */
const AP_MODE_NORMAL = 0;

/** Shared appearance-rendering helper. Renders a widget annotation to ImageData. */
async function renderWidgetAppearance(
  m: WrappedPdfiumModule,
  bitmapPtr: number,
  heapPtr: number,
  wDev: number,
  hDev: number,
  stride: number,
  bytes: number,
  pagePtr: number,
  annotPtr: number,
  annotLeft: number,
  annotTop: number,
  pdfW: number,
  pdfH: number,
  cssX: number,
  cssY: number,
  cropWidth: number,
  cropHeight: number,
  formEnvPtr: number,
  dpr: number,
): Promise<ImageData | null> {
  const pdfiumWasm = m.pdfium as any;
  const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
  const matrixView = new Float32Array(pdfiumWasm.HEAPF32.buffer, matrixPtr, 6);
  const sx = wDev / pdfW;
  const sy = hDev / pdfH;
  matrixView.set([sx, 0, 0, -sy, -sx * annotLeft, sy * annotTop]);

  let ok = false;
  try {
    ok = !!m.EPDF_RenderAnnotBitmap(
      bitmapPtr,
      pagePtr,
      annotPtr,
      AP_MODE_NORMAL,
      matrixPtr,
      RENDER_FLAG_REVERSE_BYTE_ORDER,
    );
  } catch {
    /* Extension not available */
  }
  m.pdfium.wasmExports.free(matrixPtr);
  m.FPDFBitmap_Destroy(bitmapPtr);

  let imageData: ImageData | null = null;
  if (ok) {
    const rgba = new Uint8ClampedArray(
      pdfiumWasm.HEAPU8.buffer.slice(heapPtr, heapPtr + bytes),
    );
    let hasVisible = false;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] > 0) {
        hasVisible = true;
        break;
      }
    }
    if (hasVisible) imageData = new ImageData(rgba, wDev, hDev);
  }
  m.pdfium.wasmExports.free(heapPtr);

  // Fallback: render form fill layer into a page-sized bitmap cropped to the annotation.
  if (!imageData && formEnvPtr) {
    const heap2 = m.pdfium.wasmExports.malloc(bytes);
    const bmp2 = m.FPDFBitmap_CreateEx(wDev, hDev, 4, heap2, stride);
    m.FPDFBitmap_FillRect(bmp2, 0, 0, wDev, hDev, 0x00000000);

    const fullW = Math.round(cropWidth * dpr);
    const fullH = Math.round(cropHeight * dpr);
    const startX = Math.round(-cssX * dpr);
    const startY = Math.round(-cssY * dpr);

    try {
      m.FPDF_RenderPageBitmap(
        bmp2,
        pagePtr,
        startX,
        startY,
        fullW,
        fullH,
        0,
        0x01 | 0x10,
      );
      m.FPDF_FFLDraw(
        formEnvPtr,
        bmp2,
        pagePtr,
        startX,
        startY,
        fullW,
        fullH,
        0,
        0x01 | 0x10,
      );
    } catch {
      /* fallback not available */
    }

    m.FPDFBitmap_Destroy(bmp2);

    const rgba2 = new Uint8ClampedArray(
      pdfiumWasm.HEAPU8.buffer.slice(heap2, heap2 + bytes),
    );
    let hasVisible2 = false;
    for (let i = 3; i < rgba2.length; i += 4) {
      if (rgba2[i] > 0) {
        hasVisible2 = true;
        break;
      }
    }
    if (hasVisible2) imageData = new ImageData(rgba2, wDev, hDev);
    m.pdfium.wasmExports.free(heap2);
  }

  return imageData;
}

/**
 * Extract signature widget positions AND render their appearance bitmaps.
 *
 * For each Widget annotation whose form-field type is SIGNATURE we:
 *   1. Compute CropBox-adjusted CSS coordinates (same approach as extractFormFields
 *      for coordinate consistency with the overlay system).
 *   2. Attempt to render the annotation's appearance stream via
 *      `EPDF_RenderAnnotBitmap` (an @embedpdf PDFium extension).
 *   3. If the extension is unavailable or produces no visible pixels, fall back
 *      to `FPDF_FFLDraw` which renders form elements (including signatures)
 *      into a small bitmap covering just the annotation rect.
 *   4. Return the RGBA `ImageData` so the caller can paint it into a
 *      `<canvas>` element positioned at the correct overlay location.
 *
 * When the annotation has no appearance stream (unsigned fields, or fields
 * whose PDF writer didn't embed one) `imageData` will be `null`.
 */
export async function renderSignatureFieldAppearances(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<SignatureFieldAppearance[]> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
    const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(docPtr, formInfoPtr);
    const pageCount = m.FPDF_GetPageCount(docPtr);
    const results: SignatureFieldAppearance[] = [];

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
      if (!pagePtr) continue;
      if (formEnvPtr) m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);

      // Use CropBox dimensions (same as extractFormFields) for coordinate
      // computation. This matches EmbedPDF's pdfPage.size and the overlay
      // coordinate system.
      const pageBox = readEffectivePageBox(m, pagePtr);
      const cropWidth = pageBox.right - pageBox.left;
      const cropHeight = pageBox.top - pageBox.bottom;
      const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

      for (let annotIdx = 0; annotIdx < annotCount; annotIdx++) {
        const annotPtr = m.FPDFPage_GetAnnot(pagePtr, annotIdx);
        if (!annotPtr) continue;

        const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
        if (subtype !== 20) {
          // FPDF_ANNOT_WIDGET
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        const fieldType = formEnvPtr
          ? m.FPDFAnnot_GetFormFieldType(formEnvPtr, annotPtr)
          : 0;

        if (fieldType !== PDF_FORM_FIELD_TYPE.SIGNATURE) {
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        // --- field name ---
        const nameLen = m.FPDFAnnot_GetFormFieldName(
          formEnvPtr,
          annotPtr,
          0,
          0,
        );
        let name = "";
        if (nameLen > 0) {
          const nameBuf = m.pdfium.wasmExports.malloc(nameLen);
          m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nameBuf, nameLen);
          name = readUtf16(m, nameBuf, nameLen);
          m.pdfium.wasmExports.free(nameBuf);
        }
        // Use standard FPDFAnnot_GetRect + explicit CropBox adjustment,
        // identical to extractFormFields (this_extractAnnotation). This
        // ensures coordinates are in the same space as FormFieldOverlay.
        const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
        let hasRect = false;
        try {
          hasRect = m.FPDFAnnot_GetRect(annotPtr, rectBuf);
        } catch {
          m.pdfium.wasmExports.free(rectBuf);
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }
        if (!hasRect) {
          m.pdfium.wasmExports.free(rectBuf);
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        // Standard FS_RECTF layout: {left, bottom, right, top}
        const rawLeft = m.pdfium.getValue(rectBuf, "float");
        const rawBottom = m.pdfium.getValue(rectBuf + 4, "float");
        const rawRight = m.pdfium.getValue(rectBuf + 8, "float");
        const rawTop = m.pdfium.getValue(rectBuf + 12, "float");
        m.pdfium.wasmExports.free(rectBuf);

        // Normalise
        const annotLeft = Math.min(rawLeft, rawRight);
        const annotBottom = Math.min(rawBottom, rawTop);
        const annotRight = Math.max(rawLeft, rawRight);
        const annotTop = Math.max(rawBottom, rawTop);
        const pdfW = annotRight - annotLeft;
        const pdfH = annotTop - annotBottom;

        // CropBox adjustment (mirrors extractFormFields exactly)
        const relativeX = annotLeft - pageBox.left;
        const relativeY = annotBottom - pageBox.bottom;
        const cssX = relativeX;
        const cssY = cropHeight - relativeY - pdfH;

        let imageData: ImageData | null = null;

        if (pdfW > 0.5 && pdfH > 0.5) {
          const dpr =
            typeof window !== "undefined"
              ? Math.min(window.devicePixelRatio || 1, 3)
              : 1;
          const wDev = Math.max(1, Math.round(pdfW * dpr));
          const hDev = Math.max(1, Math.round(pdfH * dpr));
          const stride = wDev * 4;
          const bytes = stride * hDev;
          const pdfiumWasm = m.pdfium as any;

          const heapPtr = m.pdfium.wasmExports.malloc(bytes);
          const bitmapPtr = m.FPDFBitmap_CreateEx(
            wDev,
            hDev,
            4 /* BGRA */,
            heapPtr,
            stride,
          );
          m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 0x00000000);

          // Build user→device matrix: maps annotation rect to bitmap.
          // PDF coords: origin bottom-left, y-up. Device: origin top-left, y-down.
          const sx = wDev / pdfW;
          const sy = hDev / pdfH;
          const matrixPtr = m.pdfium.wasmExports.malloc(6 * 4);
          const matrixView = new Float32Array(
            pdfiumWasm.HEAPF32.buffer,
            matrixPtr,
            6,
          );
          matrixView.set([sx, 0, 0, -sy, -sx * annotLeft, sy * annotTop]);

          let ok = false;
          try {
            ok = !!m.EPDF_RenderAnnotBitmap(
              bitmapPtr,
              pagePtr,
              annotPtr,
              AP_MODE_NORMAL,
              matrixPtr,
              RENDER_FLAG_REVERSE_BYTE_ORDER,
            );
          } catch {
            // Extension not available — fall through to FPDF_FFLDraw.
          }

          m.pdfium.wasmExports.free(matrixPtr);
          m.FPDFBitmap_Destroy(bitmapPtr);

          if (ok) {
            const rgba = new Uint8ClampedArray(
              pdfiumWasm.HEAPU8.buffer.slice(heapPtr, heapPtr + bytes),
            );
            let hasVisible = false;
            for (let i = 3; i < rgba.length; i += 4) {
              if (rgba[i] > 0) {
                hasVisible = true;
                break;
              }
            }
            if (hasVisible) {
              imageData = new ImageData(rgba, wDev, hDev);
            }
          }
          m.pdfium.wasmExports.free(heapPtr);

          // Renders the form fill layer (which includes signature appearances)
          // into a small bitmap covering just the annotation rect.
          if (!imageData && formEnvPtr) {
            const heap2 = m.pdfium.wasmExports.malloc(bytes);
            const bmp2 = m.FPDFBitmap_CreateEx(wDev, hDev, 4, heap2, stride);
            m.FPDFBitmap_FillRect(bmp2, 0, 0, wDev, hDev, 0x00000000);

            // Map the full page into device coords, then offset so the
            // annotation rect starts at bitmap (0, 0).
            const fullW = Math.round(cropWidth * dpr);
            const fullH = Math.round(cropHeight * dpr);
            const startX = Math.round(-cssX * dpr);
            const startY = Math.round(-cssY * dpr);

            try {
              // Draw page content first (provides background under signature)
              m.FPDF_RenderPageBitmap(
                bmp2,
                pagePtr,
                startX,
                startY,
                fullW,
                fullH,
                0,
                0x01 | 0x10, // FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER
              );
              // Draw form fill layer on top (includes signature appearances)
              m.FPDF_FFLDraw(
                formEnvPtr,
                bmp2,
                pagePtr,
                startX,
                startY,
                fullW,
                fullH,
                0,
                0x01 | 0x10,
              );
            } catch {
              // FPDF_FFLDraw not available or failed.
            }

            m.FPDFBitmap_Destroy(bmp2);

            const rgba2 = new Uint8ClampedArray(
              pdfiumWasm.HEAPU8.buffer.slice(heap2, heap2 + bytes),
            );
            let hasVisible2 = false;
            for (let i = 3; i < rgba2.length; i += 4) {
              if (rgba2[i] > 0) {
                hasVisible2 = true;
                break;
              }
            }
            if (hasVisible2) {
              imageData = new ImageData(rgba2, wDev, hDev);
            }
            m.pdfium.wasmExports.free(heap2);
          }
        }

        m.FPDFPage_CloseAnnot(annotPtr);

        results.push({
          pageIndex: pageIdx,
          x: cssX,
          y: cssY,
          width: pdfW,
          height: pdfH,
          fieldName: name,
          imageData,
          sourcePageWidth: cropWidth,
          sourcePageHeight: cropHeight,
        });
      }

      if (formEnvPtr) m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
      m.FPDF_ClosePage(pagePtr);
    }

    if (formEnvPtr) m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
    if (formInfoPtr) m.PDFiumExt_CloseFormFillInfo(formInfoPtr);

    return results;
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Render push-button widget appearances to bitmaps.
 *
 * Same rendering pipeline as renderSignatureFieldAppearances but filtered
 * to PUSHBUTTON field type.  The resulting ImageData can be painted into
 * <canvas> elements to give buttons their PDF-native visual appearance.
 */
export async function renderButtonFieldAppearances(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<SignatureFieldAppearance[]> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
    const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(docPtr, formInfoPtr);
    const pageCount = m.FPDF_GetPageCount(docPtr);
    const buttonResults: SignatureFieldAppearance[] = [];

    for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
      const pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
      if (!pagePtr) continue;
      if (formEnvPtr) m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);

      const pageBox = readEffectivePageBox(m, pagePtr);
      const cropWidth = pageBox.right - pageBox.left;
      const cropHeight = pageBox.top - pageBox.bottom;
      const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

      for (let annotIdx = 0; annotIdx < annotCount; annotIdx++) {
        const annotPtr = m.FPDFPage_GetAnnot(pagePtr, annotIdx);
        if (!annotPtr) continue;

        const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
        if (subtype !== 20) {
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        const fieldType = formEnvPtr
          ? m.FPDFAnnot_GetFormFieldType(formEnvPtr, annotPtr)
          : 0;
        if (fieldType !== PDF_FORM_FIELD_TYPE.PUSHBUTTON) {
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        const nameLen = m.FPDFAnnot_GetFormFieldName(
          formEnvPtr,
          annotPtr,
          0,
          0,
        );
        let btnName = "";
        if (nameLen > 0) {
          const nameBuf = m.pdfium.wasmExports.malloc(nameLen);
          m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nameBuf, nameLen);
          btnName = readUtf16(m, nameBuf, nameLen);
          m.pdfium.wasmExports.free(nameBuf);
        }

        const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
        let hasRect = false;
        try {
          hasRect = m.FPDFAnnot_GetRect(annotPtr, rectBuf);
        } catch {
          m.pdfium.wasmExports.free(rectBuf);
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }
        if (!hasRect) {
          m.pdfium.wasmExports.free(rectBuf);
          m.FPDFPage_CloseAnnot(annotPtr);
          continue;
        }

        const rawLeft = m.pdfium.getValue(rectBuf, "float");
        const rawBottom = m.pdfium.getValue(rectBuf + 4, "float");
        const rawRight = m.pdfium.getValue(rectBuf + 8, "float");
        const rawTop = m.pdfium.getValue(rectBuf + 12, "float");
        m.pdfium.wasmExports.free(rectBuf);

        const annotLeft = Math.min(rawLeft, rawRight);
        const annotBottom = Math.min(rawBottom, rawTop);
        const annotRight = Math.max(rawLeft, rawRight);
        const annotTopVal = Math.max(rawBottom, rawTop);
        const pdfW = annotRight - annotLeft;
        const pdfH = annotTopVal - annotBottom;

        const relativeX = annotLeft - pageBox.left;
        const relativeY = annotBottom - pageBox.bottom;
        const cssX = relativeX;
        const cssY = cropHeight - relativeY - pdfH;

        let imageData: ImageData | null = null;

        if (pdfW > 0.5 && pdfH > 0.5) {
          const dpr =
            typeof window !== "undefined"
              ? Math.min(window.devicePixelRatio || 1, 3)
              : 1;
          const wDev = Math.max(1, Math.round(pdfW * dpr));
          const hDev = Math.max(1, Math.round(pdfH * dpr));
          const stride = wDev * 4;
          const bytes = stride * hDev;
          const heapPtr = m.pdfium.wasmExports.malloc(bytes);
          const bitmapPtr = m.FPDFBitmap_CreateEx(
            wDev,
            hDev,
            4,
            heapPtr,
            stride,
          );
          m.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 0x00000000);

          imageData = await renderWidgetAppearance(
            m,
            bitmapPtr,
            heapPtr,
            wDev,
            hDev,
            stride,
            bytes,
            pagePtr,
            annotPtr,
            annotLeft,
            annotTopVal,
            pdfW,
            pdfH,
            cssX,
            cssY,
            cropWidth,
            cropHeight,
            formEnvPtr,
            dpr,
          );
        }

        m.FPDFPage_CloseAnnot(annotPtr);
        buttonResults.push({
          pageIndex: pageIdx,
          x: cssX,
          y: cssY,
          width: pdfW,
          height: pdfH,
          fieldName: btnName,
          imageData,
          sourcePageWidth: cropWidth,
          sourcePageHeight: cropHeight,
        });
      }

      if (formEnvPtr) m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
      m.FPDF_ClosePage(pagePtr);
    }

    if (formEnvPtr) m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
    if (formInfoPtr) m.PDFiumExt_CloseFormFillInfo(formInfoPtr);

    return buttonResults;
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Fetch signature fields with their rendered appearances.
 *
 * This combines extractSignatureFieldRects and renderSignatureFieldAppearances
 * to return FormField objects suitable for use in pdfbox mode where signature
 * fields are not returned by the backend.
 *
 * @param data - PDF file data
 * @param password - Optional PDF password
 * @returns Array of FormField objects for signature fields with appearanceDataUrl populated
 */
export async function fetchSignatureFieldsWithAppearances(
  data: ArrayBuffer | Uint8Array,
  password?: string,
): Promise<FormField[]> {
  const appearances = await renderSignatureFieldAppearances(data, password);
  const formFields: FormField[] = [];

  for (const appearance of appearances) {
    const widget: WidgetCoordinates = {
      pageIndex: appearance.pageIndex,
      x: appearance.x,
      y: appearance.y,
      width: appearance.width,
      height: appearance.height,
    };

    // Convert ImageData to data URL for the appearance
    let appearanceDataUrl: string | undefined;
    if (appearance.imageData) {
      const canvas = document.createElement("canvas");
      canvas.width = appearance.imageData.width;
      canvas.height = appearance.imageData.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(appearance.imageData, 0, 0);
        appearanceDataUrl = canvas.toDataURL("image/png");
      }
    }

    formFields.push({
      name: appearance.fieldName,
      label: appearance.fieldName,
      type: "signature",
      value: "",
      options: null,
      displayOptions: null,
      required: false,
      readOnly: true,
      multiSelect: false,
      multiline: false,
      tooltip: null,
      widgets: [widget],
      appearanceDataUrl,
    });
  }

  return formFields;
}
