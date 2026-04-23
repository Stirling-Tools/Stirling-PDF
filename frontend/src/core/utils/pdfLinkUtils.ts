/**
 * pdfLinkUtils — Create, modify, and extract link annotations in PDF documents.
 *
 * Migrated from @cantoo/pdf-lib to @embedpdf/pdfium WASM.
 * All operations are performed via PDFium C API wrappers.
 */
import {
  getPdfiumModule,
  openRawDocumentSafe,
  closeDocAndFreeBuffer,
  saveRawDocument,
  readUtf16,
  writeUtf16,
  readAnnotRectAdjusted,
  parseRectToCss,
} from "@app/services/pdfiumService";
import {
  FPDF_ANNOT_LINK,
  PDFACTION_GOTO,
  PDFACTION_URI,
} from "@app/utils/pdfiumBitmapUtils";

export type LinkType = "internal" | "external" | "unknown";
export type LinkBorderStyle =
  | "solid"
  | "dashed"
  | "beveled"
  | "inset"
  | "underline";
export type LinkHighlightMode = "none" | "invert" | "outline" | "push";

export interface PdfLibLink {
  id: string;
  /** Index of this annotation in the page's /Annots array (used for deletion matching). */
  annotIndex: number;
  /** Rectangle in PDF-page coordinate space (top-left origin, unscaled). */
  rect: { x: number; y: number; width: number; height: number };
  type: LinkType;
  /** 0-based target page index (internal links). */
  targetPage?: number;
  /** URI for external links. */
  uri?: string;
  /** Tooltip / alt text from the /Contents entry. */
  title?: string;
  /** RGB color of the link annotation border (each component 0–1). */
  color?: [number, number, number];
  /** Border width and style. */
  borderStyle?: { width: number; style: LinkBorderStyle };
  /** Visual feedback when the link is clicked. */
  highlightMode?: LinkHighlightMode;
}

export interface CreateLinkOptions {
  /** 0-based page index. */
  pageIndex: number;
  /** Link rectangle in CSS (top-left origin) coordinate space. */
  rect: { x: number; y: number; width: number; height: number };
  /** External URL (mutually exclusive with destinationPage). */
  url?: string;
  /** Internal destination page index, 0-based (mutually exclusive with url). */
  destinationPage?: number;
  /** Tooltip text shown on hover (stored in /Contents). */
  title?: string;
  /** RGB colour for the border, each component 0–1. Defaults to blue. */
  color?: [number, number, number];
  /** Border width in points. 0 = invisible (PDF convention). */
  borderWidth?: number;
  /** Border line style. */
  borderStyle?: LinkBorderStyle;
  /** Visual feedback when the link is clicked. */
  highlightMode?: LinkHighlightMode;
}

/**
 * Create a link annotation on a PDF page.
 * Mutates the document in-place and returns the updated PDF bytes.
 */
export async function createLinkAnnotation(
  data: ArrayBuffer | Uint8Array,
  options: CreateLinkOptions,
  password?: string,
): Promise<ArrayBuffer> {
  const {
    pageIndex,
    rect,
    url,
    destinationPage,
    title,
    color = [0, 0, 1],
    borderWidth = 0,
  } = options;

  if (!url && destinationPage === undefined) {
    throw new Error(
      "createLinkAnnotation: must provide either url or destinationPage",
    );
  }
  if (url && destinationPage !== undefined) {
    throw new Error(
      "createLinkAnnotation: url and destinationPage are mutually exclusive",
    );
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error("createLinkAnnotation: rect dimensions must be positive");
  }

  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const pageCount = m.FPDF_GetPageCount(docPtr);
    if (
      destinationPage !== undefined &&
      (destinationPage < 0 || destinationPage >= pageCount)
    ) {
      throw new RangeError(
        `createLinkAnnotation: destinationPage ${destinationPage} out of range [0, ${pageCount})`,
      );
    }

    const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) throw new Error(`Failed to load page ${pageIndex}`);

    try {
      const pageHeight = m.FPDF_GetPageHeightF(pagePtr);

      const annotPtr = m.FPDFPage_CreateAnnot(pagePtr, FPDF_ANNOT_LINK);
      if (!annotPtr) {
        throw new Error("Failed to create link annotation");
      }

      try {
        // Set rect (convert from CSS top-left to PDF bottom-left origin)
        // FS_RECTF layout: { left, top, right, bottom } where top > bottom in PDF coords
        const pdfLeft = rect.x;
        const pdfTop = pageHeight - rect.y; // CSS y=0 → PDF top
        const pdfRight = rect.x + rect.width;
        const pdfBottom = pageHeight - rect.y - rect.height; // CSS bottom → PDF bottom

        const rectBuf = m.pdfium.wasmExports.malloc(4 * 4);
        m.pdfium.setValue(rectBuf, pdfLeft, "float"); // offset 0: left
        m.pdfium.setValue(rectBuf + 4, pdfTop, "float"); // offset 4: top  (larger y)
        m.pdfium.setValue(rectBuf + 8, pdfRight, "float"); // offset 8: right
        m.pdfium.setValue(rectBuf + 12, pdfBottom, "float"); // offset 12: bottom (smaller y)
        m.FPDFAnnot_SetRect(annotPtr, rectBuf);
        m.pdfium.wasmExports.free(rectBuf);

        // Set color
        // FPDFANNOT_COLORTYPE_Color = 0
        m.FPDFAnnot_SetColor(
          annotPtr,
          0,
          Math.round(color[0] * 255),
          Math.round(color[1] * 255),
          Math.round(color[2] * 255),
          255,
        );

        // Set border
        m.FPDFAnnot_SetBorder(annotPtr, 0, 0, borderWidth);

        // Set URI for external links
        if (url) {
          const uriPtr = writeUtf16(m, url);
          m.FPDFAnnot_SetURI(annotPtr, uriPtr);
          m.pdfium.wasmExports.free(uriPtr);
        }

        // Set title / contents
        if (title) {
          const titlePtr = writeUtf16(m, title);
          m.FPDFAnnot_SetStringValue(annotPtr, "Contents", titlePtr);
          m.pdfium.wasmExports.free(titlePtr);
        }
      } finally {
        m.FPDFPage_CloseAnnot(annotPtr);
      }
    } finally {
      m.FPDF_ClosePage(pagePtr);
    }

    return await saveRawDocument(docPtr);
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Remove a link annotation from a page by its index.
 * Returns the updated PDF bytes.
 */
export async function removeLinkAnnotation(
  data: ArrayBuffer | Uint8Array,
  pageIndex: number,
  annotIndex: number,
  password?: string,
): Promise<ArrayBuffer> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) throw new Error(`Failed to load page ${pageIndex}`);

    m.FPDFPage_RemoveAnnot(pagePtr, annotIndex);
    m.FPDF_ClosePage(pagePtr);

    return await saveRawDocument(docPtr);
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}

/**
 * Extract all link annotations from a given PDF page.
 */
export async function extractLinksFromPage(
  data: ArrayBuffer | Uint8Array,
  pageIndex: number,
  password?: string,
): Promise<{
  links: PdfLibLink[];
  pdfPageWidth: number;
  pdfPageHeight: number;
}> {
  const m = await getPdfiumModule();
  const docPtr = await openRawDocumentSafe(data, password);

  try {
    const pagePtr = m.FPDF_LoadPage(docPtr, pageIndex);
    if (!pagePtr) return { links: [], pdfPageWidth: 0, pdfPageHeight: 0 };

    const pageWidth = m.FPDF_GetPageWidthF(pagePtr);
    const pageHeight = m.FPDF_GetPageHeightF(pagePtr);
    const links: PdfLibLink[] = [];
    const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);

    for (let i = 0; i < annotCount; i++) {
      try {
        const annotPtr = m.FPDFPage_GetAnnot(pagePtr, i);
        if (!annotPtr) continue;

        const subtype = m.FPDFAnnot_GetSubtype(annotPtr);
        if (subtype !== FPDF_ANNOT_LINK) {
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
        let linkType: LinkType = "unknown";
        let targetPage: number | undefined;
        let uri: string | undefined;

        if (linkPtr) {
          // Check for action
          const actionPtr = m.FPDFLink_GetAction(linkPtr);
          if (actionPtr) {
            const actionType = m.FPDFAction_GetType(actionPtr);
            if (actionType === PDFACTION_URI) {
              const uriLen = m.FPDFAction_GetURIPath(docPtr, actionPtr, 0, 0);
              if (uriLen > 0) {
                const uriBuf = m.pdfium.wasmExports.malloc(uriLen);
                m.FPDFAction_GetURIPath(docPtr, actionPtr, uriBuf, uriLen);
                uri = m.pdfium.UTF8ToString(uriBuf);
                m.pdfium.wasmExports.free(uriBuf);
                linkType = "external";
              }
            } else if (actionType === PDFACTION_GOTO) {
              const destPtr = m.FPDFAction_GetDest(docPtr, actionPtr);
              if (destPtr) {
                targetPage = m.FPDFDest_GetDestPageIndex(docPtr, destPtr);
                linkType = "internal";
              }
            }
          }

          // Check for direct destination
          if (linkType === "unknown") {
            const destPtr = m.FPDFLink_GetDest(docPtr, linkPtr);
            if (destPtr) {
              targetPage = m.FPDFDest_GetDestPageIndex(docPtr, destPtr);
              linkType = "internal";
            }
          }
        }

        // Get title from /Contents
        let title: string | undefined;
        const contentsLen = m.FPDFAnnot_GetStringValue(
          annotPtr,
          "Contents",
          0,
          0,
        );
        if (contentsLen > 2) {
          const contentsBuf = m.pdfium.wasmExports.malloc(contentsLen);
          m.FPDFAnnot_GetStringValue(
            annotPtr,
            "Contents",
            contentsBuf,
            contentsLen,
          );
          title = readUtf16(m, contentsBuf, contentsLen) || undefined;
          m.pdfium.wasmExports.free(contentsBuf);
        }

        // Get color
        let color: [number, number, number] | undefined;
        // allocate 4 uint for RGBA
        const rPtr = m.pdfium.wasmExports.malloc(16);
        const gPtr = rPtr + 4;
        const bPtr = rPtr + 8;
        const aPtr = rPtr + 12;
        const hasColor = m.FPDFAnnot_GetColor(
          annotPtr,
          0,
          rPtr,
          gPtr,
          bPtr,
          aPtr,
        );
        if (hasColor) {
          color = [
            m.pdfium.getValue(rPtr, "i32") / 255,
            m.pdfium.getValue(gPtr, "i32") / 255,
            m.pdfium.getValue(bPtr, "i32") / 255,
          ];
        }
        m.pdfium.wasmExports.free(rPtr);

        links.push({
          id: `link-${pageIndex}-${i}`,
          annotIndex: i,
          rect,
          type: linkType,
          targetPage,
          uri,
          title,
          color,
        });

        m.FPDFPage_CloseAnnot(annotPtr);
      } catch (e) {
        console.warn("[pdfLinkUtils] Failed to parse annotation:", e);
      }
    }

    m.FPDF_ClosePage(pagePtr);
    return { links, pdfPageWidth: pageWidth, pdfPageHeight: pageHeight };
  } finally {
    closeDocAndFreeBuffer(m, docPtr);
  }
}
