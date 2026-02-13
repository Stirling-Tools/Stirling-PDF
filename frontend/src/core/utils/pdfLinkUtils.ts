/**
 * pdfLinkUtils — Create and modify link annotations in PDF documents.
 *
 * Complements the read-only link extraction in usePdfLibLinks.ts by providing
 * a write API for programmatically adding hyperlinks to PDFs.
 */
import {
  PDFDocument,
  PDFPage,
  PDFName,
  PDFString,
  PDFArray,
  PDFDict,
  PDFRef,
} from '@cantoo/pdf-lib';
import type { LinkBorderStyle, LinkHighlightMode } from '@app/hooks/usePdfLibLinks';

export interface CreateLinkOptions {
  /** Page to place the link on. */
  page: PDFPage;
  /** Link rectangle in PDF user-space coordinates (lower-left origin). */
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
 * Supports both external URIs and internal GoTo page destinations.
 *
 * @example
 * ```ts
 * await createLinkAnnotation(pdfDoc, {
 *   page: pdfDoc.getPage(0),
 *   rect: { x: 100, y: 500, width: 200, height: 20 },
 *   url: 'https://stirlingpdf.com',
 *   title: 'Visit Stirling PDF',
 *   color: [0, 0, 0.8],
 * });
 * ```
 */
export function createLinkAnnotation(
  pdfDoc: PDFDocument,
  options: CreateLinkOptions,
): void {
  const {
    page,
    rect,
    url,
    destinationPage,
    title,
    color = [0, 0, 1],
    borderWidth = 0,
    borderStyle = 'solid',
    highlightMode = 'invert',
  } = options;

  if (!url && destinationPage === undefined) {
    throw new Error('createLinkAnnotation: must provide either url or destinationPage');
  }
  if (url && destinationPage !== undefined) {
    throw new Error('createLinkAnnotation: url and destinationPage are mutually exclusive');
  }
  if (destinationPage !== undefined) {
    const pageCount = pdfDoc.getPageCount();
    if (destinationPage < 0 || destinationPage >= pageCount) {
      throw new RangeError(
        `createLinkAnnotation: destinationPage ${destinationPage} out of range [0, ${pageCount})`,
      );
    }
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error('createLinkAnnotation: rect dimensions must be positive');
  }
  if (color.some((c) => c < 0 || c > 1)) {
    throw new RangeError('createLinkAnnotation: color components must be between 0 and 1');
  }
  if (borderWidth < 0) {
    throw new RangeError('createLinkAnnotation: borderWidth must be non-negative');
  }

  const ctx = pdfDoc.context;

  // Build the raw annotation dictionary entries
  const entries: Record<string, any> = {
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, borderWidth],
    C: color,
    H: PDFName.of(highlightModeCode(highlightMode)),
  };

  // /Contents — tooltip / alt text
  if (title) {
    entries.Contents = PDFString.of(title);
  }

  const annotDict = ctx.obj(entries);

  // Add /BS (Border Style) if non-default
  if (borderStyle !== 'solid' && borderWidth > 0) {
    const bsDict = ctx.obj({
      W: borderWidth,
      S: PDFName.of(borderStyleCode(borderStyle)),
    });
    (annotDict as PDFDict).set(PDFName.of('BS'), bsDict);
  }

  // Action or destination
  if (url) {
    const actionDict = ctx.obj({
      S: 'URI',
      URI: PDFString.of(url),
    });
    (annotDict as PDFDict).set(PDFName.of('A'), actionDict);
  } else if (destinationPage !== undefined) {
    const destPage = pdfDoc.getPage(destinationPage);
    // XYZ null null null = keep current position & zoom
    const destArray = ctx.obj([destPage.ref, 'XYZ', null, null, null]);
    (annotDict as PDFDict).set(PDFName.of('Dest'), destArray);
  }

  // Register the annotation in the PDF's cross-reference table
  const annotRef = ctx.register(annotDict);

  // Append to the page's /Annots array (creating it if absent)
  const existingAnnots = page.node.get(PDFName.of('Annots'));
  if (existingAnnots) {
    const resolvedAnnots =
      existingAnnots instanceof PDFRef ? ctx.lookup(existingAnnots) : existingAnnots;
    if (resolvedAnnots instanceof PDFArray) {
      resolvedAnnots.push(annotRef);
    } else {
      // Unexpected type — replace with a fresh array
      page.node.set(PDFName.of('Annots'), ctx.obj([annotRef]));
    }
  } else {
    page.node.set(PDFName.of('Annots'), ctx.obj([annotRef]));
  }
}

/**
 * Remove a link annotation from a page by its index in the /Annots array.
 * Returns true if the annotation was found and removed.
 */
export function removeLinkAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  annotIndex: number,
): boolean {
  const ctx = pdfDoc.context;
  const annotsRaw = page.node.get(PDFName.of('Annots'));
  if (!annotsRaw) return false;

  const annots =
    annotsRaw instanceof PDFRef ? ctx.lookup(annotsRaw) : annotsRaw;
  if (!(annots instanceof PDFArray)) return false;

  if (annotIndex < 0 || annotIndex >= annots.size()) return false;

  // Delete the referenced object from the xref table
  const entry = annots.get(annotIndex);
  if (entry instanceof PDFRef) {
    ctx.delete(entry);
  }

  // Remove from the array
  annots.remove(annotIndex);

  // If the array is now empty, remove the /Annots key entirely
  if (annots.size() === 0) {
    page.node.delete(PDFName.of('Annots'));
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

function borderStyleCode(style: LinkBorderStyle): string {
  switch (style) {
    case 'dashed':    return 'D';
    case 'beveled':   return 'B';
    case 'inset':     return 'I';
    case 'underline': return 'U';
    default:          return 'S';
  }
}

function highlightModeCode(mode: LinkHighlightMode): string {
  switch (mode) {
    case 'none':    return 'N';
    case 'outline': return 'O';
    case 'push':    return 'P';
    default:        return 'I';
  }
}
