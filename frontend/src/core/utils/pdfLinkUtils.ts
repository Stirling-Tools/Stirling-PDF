/**
 * pdfLinkUtils — Create, modify, and extract link annotations in PDF documents.
 */
import {
  PDFDocument,
  PDFPage,
  PDFName,
  PDFString,
  PDFArray,
  PDFDict,
  PDFRef,
  PDFContext,
  PDFNumber,
  PDFHexString,
} from '@cantoo/pdf-lib';

export type LinkType = 'internal' | 'external' | 'unknown';
export type LinkBorderStyle = 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline';
export type LinkHighlightMode = 'none' | 'invert' | 'outline' | 'push';

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

  const entries: Record<string, any> = {
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, borderWidth],
    C: color,
    H: PDFName.of(highlightModeCode(highlightMode)),
  };

  if (title) {
    entries.Contents = PDFString.of(title);
  }

  const annotDict = ctx.obj(entries);

  if (borderStyle !== 'solid' && borderWidth > 0) {
    const bsDict = ctx.obj({
      W: borderWidth,
      S: PDFName.of(borderStyleCode(borderStyle)),
    });
    (annotDict as PDFDict).set(PDFName.of('BS'), bsDict);
  }

  if (url) {
    const actionDict = ctx.obj({
      S: 'URI',
      URI: PDFString.of(url),
    });
    (annotDict as PDFDict).set(PDFName.of('A'), actionDict);
  } else if (destinationPage !== undefined) {
    const destPage = pdfDoc.getPage(destinationPage);
    const destArray = ctx.obj([destPage.ref, 'XYZ', null, null, null]);
    (annotDict as PDFDict).set(PDFName.of('Dest'), destArray);
  }

  const annotRef = ctx.register(annotDict);

  const existingAnnots = page.node.get(PDFName.of('Annots'));
  if (existingAnnots) {
    const resolvedAnnots =
      existingAnnots instanceof PDFRef ? ctx.lookup(existingAnnots) : existingAnnots;
    if (resolvedAnnots instanceof PDFArray) {
      resolvedAnnots.push(annotRef);
    } else {
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

  const entry = annots.get(annotIndex);
  if (entry instanceof PDFRef) {
    ctx.delete(entry);
  }

  annots.remove(annotIndex);

  if (annots.size() === 0) {
    page.node.delete(PDFName.of('Annots'));
  }

  return true;
}

/**
 * Extract all link annotations from a given PDF page.
 */
export function extractLinksFromPage(
  doc: PDFDocument,
  page: PDFPage,
  pageIndex: number,
): PdfLibLink[] {
  const links: PdfLibLink[] = [];
  const ctx = doc.context;
  const { height: pageHeight } = page.getSize();

  const annotsRaw = page.node.get(PDFName.of('Annots'));
  if (!annotsRaw) return links;

  const annots = annotsRaw instanceof PDFRef ? ctx.lookup(annotsRaw) : annotsRaw;
  if (!(annots instanceof PDFArray)) return links;

  for (let i = 0; i < annots.size(); i++) {
    try {
      const annotRaw = annots.get(i);
      const annot = annotRaw instanceof PDFRef ? ctx.lookup(annotRaw) : annotRaw;
      if (!(annot instanceof PDFDict)) continue;

      const subtype = annot.get(PDFName.of('Subtype'));
      if (subtype?.toString() !== '/Link') continue;

      const rectRaw = annot.get(PDFName.of('Rect'));
      const rect = rectRaw instanceof PDFRef ? ctx.lookup(rectRaw) : rectRaw;
      if (!(rect instanceof PDFArray) || rect.size() < 4) continue;

      const x1 = num(ctx, rect.get(0));
      const y1 = num(ctx, rect.get(1));
      const x2 = num(ctx, rect.get(2));
      const y2 = num(ctx, rect.get(3));

      const left = Math.min(x1, x2);
      const bottom = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const top = pageHeight - bottom - height;

      let linkType: LinkType = 'unknown';
      let targetPage: number | undefined;
      let uri: string | undefined;

      const actionRaw = annot.get(PDFName.of('A'));
      const action = actionRaw instanceof PDFRef ? ctx.lookup(actionRaw) : actionRaw;

      if (action instanceof PDFDict) {
        const actionType = action.get(PDFName.of('S'))?.toString();

        if (actionType === '/URI') {
          linkType = 'external';
          uri = str(ctx, action.get(PDFName.of('URI')));
        } else if (actionType === '/GoTo') {
          linkType = 'internal';
          const dest = action.get(PDFName.of('D'));
          const destResolved = dest instanceof PDFRef ? ctx.lookup(dest) : dest;
          if (destResolved instanceof PDFArray) {
            targetPage = resolveDestArray(doc, ctx, destResolved);
          } else {
            const destName = str(ctx, destResolved);
            if (destName) {
              targetPage = resolveNamedDest(doc, ctx, destName);
            }
          }
        } else if (actionType === '/GoToR' || actionType === '/Launch') {
          linkType = 'external';
          uri = str(ctx, action.get(PDFName.of('F')));
        }
      }

      if (linkType === 'unknown') {
        const destRaw = annot.get(PDFName.of('Dest'));
        const dest = destRaw instanceof PDFRef ? ctx.lookup(destRaw) : destRaw;

        if (dest instanceof PDFArray) {
          linkType = 'internal';
          targetPage = resolveDestArray(doc, ctx, dest);
        } else {
          const destName = str(ctx, dest);
          if (destName) {
            linkType = 'internal';
            targetPage = resolveNamedDest(doc, ctx, destName);
          }
        }
      }

      const title = extractTitle(ctx, annot);
      const color = extractColor(ctx, annot);
      const borderStyle = extractBorderStyle(ctx, annot);
      const highlightMode = parseHighlightMode(ctx, annot.get(PDFName.of('H')));

      links.push({
        id: `pdflib-link-${pageIndex}-${i}`,
        annotIndex: i,
        rect: { x: left, y: top, width, height },
        type: linkType,
        targetPage,
        uri,
        title,
        color,
        borderStyle,
        highlightMode,
      });
    } catch (e) {
      console.warn('[pdfLinkUtils] Failed to parse annotation:', e);
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// Private Helpers (Internal to extraction logic)
// ---------------------------------------------------------------------------

function num(ctx: PDFContext, value: unknown): number {
  const resolved = value instanceof PDFRef ? ctx.lookup(value) : value;
  if (resolved instanceof PDFNumber) return resolved.asNumber();
  if (typeof resolved === 'number') return resolved;
  return 0;
}

function str(ctx: PDFContext, value: unknown): string | undefined {
  const resolved = value instanceof PDFRef ? ctx.lookup(value) : value;
  if (resolved instanceof PDFString) return resolved.decodeText();
  if (resolved instanceof PDFHexString) return resolved.decodeText();
  if (typeof resolved === 'string') return resolved;
  return undefined;
}

function resolvePageIndex(doc: PDFDocument, pageRef: PDFRef): number | undefined {
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const ref = pages[i].ref;
    if (
      ref === pageRef ||
      (ref.objectNumber === pageRef.objectNumber &&
        ref.generationNumber === pageRef.generationNumber)
    ) {
      return i;
    }
  }
  return undefined;
}

function resolveDestArray(
  doc: PDFDocument,
  ctx: PDFContext,
  destArr: PDFArray,
): number | undefined {
  if (destArr.size() < 1) return undefined;
  const first = destArr.get(0);
  if (first instanceof PDFRef) {
    return resolvePageIndex(doc, first);
  }
  const n = num(ctx, first);
  if (typeof n === 'number' && n >= 0) return n;
  return undefined;
}

function resolveNamedDest(
  doc: PDFDocument,
  ctx: PDFContext,
  name: string,
): number | undefined {
  try {
    const catalog = doc.catalog;

    const namesRaw = catalog.get(PDFName.of('Names'));
    const namesDict = namesRaw instanceof PDFRef ? ctx.lookup(namesRaw) : namesRaw;
    if (namesDict instanceof PDFDict) {
      const destsRaw = namesDict.get(PDFName.of('Dests'));
      const destsTree = destsRaw instanceof PDFRef ? ctx.lookup(destsRaw) : destsRaw;
      if (destsTree instanceof PDFDict) {
        const result = searchNameTree(doc, ctx, destsTree, name);
        if (result !== undefined) return result;
      }
    }

    const destsRaw = catalog.get(PDFName.of('Dests'));
    const destsDict = destsRaw instanceof PDFRef ? ctx.lookup(destsRaw) : destsRaw;
    if (destsDict instanceof PDFDict) {
      const dest = destsDict.get(PDFName.of(name));
      const destResolved = dest instanceof PDFRef ? ctx.lookup(dest) : dest;
      if (destResolved instanceof PDFArray) {
        return resolveDestArray(doc, ctx, destResolved);
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function searchNameTree(
  doc: PDFDocument,
  ctx: PDFContext,
  node: PDFDict,
  name: string,
): number | undefined {
  const namesArr = node.get(PDFName.of('Names'));
  const resolved = namesArr instanceof PDFRef ? ctx.lookup(namesArr) : namesArr;
  if (resolved instanceof PDFArray) {
    for (let i = 0; i < resolved.size(); i += 2) {
      const key = str(ctx, resolved.get(i));
      if (key === name) {
        const val = resolved.get(i + 1);
        const valResolved = val instanceof PDFRef ? ctx.lookup(val) : val;
        if (valResolved instanceof PDFArray) {
          return resolveDestArray(doc, ctx, valResolved);
        }
        if (valResolved instanceof PDFDict) {
          const d = valResolved.get(PDFName.of('D'));
          const dResolved = d instanceof PDFRef ? ctx.lookup(d) : d;
          if (dResolved instanceof PDFArray) {
            return resolveDestArray(doc, ctx, dResolved);
          }
        }
      }
    }
  }

  const kidsArr = node.get(PDFName.of('Kids'));
  const kidsResolved = kidsArr instanceof PDFRef ? ctx.lookup(kidsArr) : kidsArr;
  if (kidsResolved instanceof PDFArray) {
    for (let i = 0; i < kidsResolved.size(); i++) {
      const kidRef = kidsResolved.get(i);
      const kid = kidRef instanceof PDFRef ? ctx.lookup(kidRef) : kidRef;
      if (kid instanceof PDFDict) {
        const limits = kid.get(PDFName.of('Limits'));
        const limitsResolved = limits instanceof PDFRef ? ctx.lookup(limits) : limits;
        if (limitsResolved instanceof PDFArray && limitsResolved.size() >= 2) {
          const lo = str(ctx, limitsResolved.get(0)) ?? '';
          const hi = str(ctx, limitsResolved.get(1)) ?? '';
          if (name < lo || name > hi) continue;
        }
        const result = searchNameTree(doc, ctx, kid, name);
        if (result !== undefined) return result;
      }
    }
  }

  return undefined;
}

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

function parseBorderStyleName(ctx: PDFContext, value: unknown): LinkBorderStyle {
  if (!value) return 'solid';
  const resolved = value instanceof PDFRef ? ctx.lookup(value) : value;
  const s = resolved instanceof PDFName ? resolved.decodeText() : String(resolved);
  switch (s) {
    case 'D': return 'dashed';
    case 'B': return 'beveled';
    case 'I': return 'inset';
    case 'U': return 'underline';
    default:  return 'solid';
  }
}

function parseHighlightMode(ctx: PDFContext, value: unknown): LinkHighlightMode {
  if (!value) return 'invert';
  const resolved = value instanceof PDFRef ? ctx.lookup(value) : value;
  const s = resolved instanceof PDFName ? resolved.decodeText() : String(resolved);
  switch (s) {
    case 'N': return 'none';
    case 'I': return 'invert';
    case 'O': return 'outline';
    case 'P': return 'push';
    default:  return 'invert';
  }
}

function extractBorderStyle(
  ctx: PDFContext,
  annot: PDFDict,
): PdfLibLink['borderStyle'] | undefined {
  const bsRaw = annot.get(PDFName.of('BS'));
  const bs = bsRaw instanceof PDFRef ? ctx.lookup(bsRaw) : bsRaw;
  if (bs instanceof PDFDict) {
    const w = bs.get(PDFName.of('W'));
    const s = bs.get(PDFName.of('S'));
    return {
      width: num(ctx, w) || 1,
      style: parseBorderStyleName(ctx, s),
    };
  }

  const borderRaw = annot.get(PDFName.of('Border'));
  const border = borderRaw instanceof PDFRef ? ctx.lookup(borderRaw) : borderRaw;
  if (border instanceof PDFArray && border.size() >= 3) {
    const width = num(ctx, border.get(2));
    const style: LinkBorderStyle = border.size() >= 4 ? 'dashed' : 'solid';
    return { width, style };
  }

  return undefined;
}

function extractColor(
  ctx: PDFContext,
  annot: PDFDict,
): [number, number, number] | undefined {
  const cRaw = annot.get(PDFName.of('C'));
  const c = cRaw instanceof PDFRef ? ctx.lookup(cRaw) : cRaw;
  if (!(c instanceof PDFArray)) return undefined;

  const len = c.size();
  if (len === 3) {
    return [num(ctx, c.get(0)), num(ctx, c.get(1)), num(ctx, c.get(2))];
  }
  if (len === 1) {
    const g = num(ctx, c.get(0));
    return [g, g, g];
  }
  if (len === 4) {
    const cVal = num(ctx, c.get(0));
    const m = num(ctx, c.get(1));
    const y = num(ctx, c.get(2));
    const k = num(ctx, c.get(3));
    return [
      (1 - cVal) * (1 - k),
      (1 - m) * (1 - k),
      (1 - y) * (1 - k),
    ];
  }
  return undefined;
}

function extractTitle(
  ctx: PDFContext,
  annot: PDFDict,
): string | undefined {
  const raw = annot.get(PDFName.of('Contents'));
  const resolved = raw instanceof PDFRef ? ctx.lookup(raw) : raw;
  if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
    return resolved.decodeText();
  }
  return undefined;
}
