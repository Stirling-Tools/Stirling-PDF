import { useState, useEffect, useRef } from 'react';
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFString,
  PDFHexString,
  PDFNumber,
  PDFRef,
  PDFPage,
  PDFContext,
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

export interface PdfLibLinksResult {
  links: PdfLibLink[];
  /** Original PDF page width (unscaled, in PDF points). */
  pdfPageWidth: number;
  /** Original PDF page height (unscaled, in PDF points). */
  pdfPageHeight: number;
  loading: boolean;
}

interface CachedDoc {
  doc: PDFDocument;
  /** Number of active consumers (hook instances) holding this entry. */
  refCount: number;
  /** Per-page extracted links (lazy, filled on first request). */
  pageLinks: Map<number, { links: PdfLibLink[]; width: number; height: number }>;
  /** Set to true when the PDF catalog/pages tree is invalid, so we
   *  skip link extraction on all subsequent calls without retrying. */
  invalidCatalog?: boolean;
}

const docCache = new Map<string, Promise<CachedDoc>>();

async function acquireDocument(url: string): Promise<CachedDoc> {
  if (!docCache.has(url)) {
    const promise = (async (): Promise<CachedDoc> => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const doc = await PDFDocument.load(new Uint8Array(buffer), {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      });

      return { doc, refCount: 0, pageLinks: new Map() };
    })();
    docCache.set(url, promise);
    promise.catch(() => {
      docCache.delete(url);
    });
  }
  const cached = await docCache.get(url)!;
  cached.refCount++;
  return cached;
}

function releaseDocument(url: string): void {
  const entry = docCache.get(url);
  if (!entry) return;
  entry.then((cached) => {
    cached.refCount--;
    if (cached.refCount <= 0) {
      docCache.delete(url);
    }
  });
}

function num(ctx: PDFContext, value: unknown): number {
  if (value instanceof PDFRef) value = ctx.lookup(value);
  if (value instanceof PDFNumber) return value.asNumber();
  if (typeof value === 'number') return value;
  return 0;
}

function str(ctx: PDFContext, value: unknown): string | undefined {
  if (value instanceof PDFRef) value = ctx.lookup(value);
  if (value instanceof PDFString) return value.decodeText();
  if (value instanceof PDFHexString) return value.decodeText();
  if (typeof value === 'string') return value;
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
    // Swallow named dest resolution is best-effort
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


function parseBorderStyleName(value: unknown): LinkBorderStyle {
  if (!value) return 'solid';
  const s = value instanceof PDFName ? value.decodeText() : String(value);
  switch (s) {
    case 'D': return 'dashed';
    case 'B': return 'beveled';
    case 'I': return 'inset';
    case 'U': return 'underline';
    default:  return 'solid';
  }
}

function parseHighlightMode(value: unknown): LinkHighlightMode {
  if (!value) return 'invert';
  const s = value instanceof PDFName ? value.decodeText() : String(value);
  switch (s) {
    case 'N': return 'none';
    case 'I': return 'invert';
    case 'O': return 'outline';
    case 'P': return 'push';
    default:  return 'invert';
  }
}

/**
 * Extract /Border or /BS (Border Style) entry from a link annotation dict.
 */
function extractBorderStyle(
  ctx: PDFContext,
  annot: PDFDict,
): PdfLibLink['borderStyle'] | undefined {
  // Prefer /BS (PDF 1.2+ border-style dict) over legacy /Border array.
  const bsRaw = annot.get(PDFName.of('BS'));
  const bs = bsRaw instanceof PDFRef ? ctx.lookup(bsRaw) : bsRaw;
  if (bs instanceof PDFDict) {
    const w = bs.get(PDFName.of('W'));
    const s = bs.get(PDFName.of('S'));
    return {
      width: num(ctx, w) || 1,
      style: parseBorderStyleName(s),
    };
  }

  // Fall back to /Border array: [horizontal-radius, vertical-radius, width [, dash-pattern]]
  const borderRaw = annot.get(PDFName.of('Border'));
  const border = borderRaw instanceof PDFRef ? ctx.lookup(borderRaw) : borderRaw;
  if (border instanceof PDFArray && border.size() >= 3) {
    const width = num(ctx, border.get(2));
    const style: LinkBorderStyle = border.size() >= 4 ? 'dashed' : 'solid';
    return { width, style };
  }

  return undefined;
}

/**
 * Extract /C (Color) entry an array of 1, 3, or 4 numbers.
 * We normalise to RGB (3-component).
 */
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
    // Grayscale — expand to RGB
    const g = num(ctx, c.get(0));
    return [g, g, g];
  }
  if (len === 4) {
    // CMYK → approximate RGB
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

/**
 * Extract /Contents entry (tooltip / alt text).
 */
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

function extractLinksFromPage(
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
        } else if (actionType === '/GoToR') {
          linkType = 'external';
          uri = str(ctx, action.get(PDFName.of('F')));
        } else if (actionType === '/Launch') {
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
      const highlightMode = parseHighlightMode(annot.get(PDFName.of('H')));

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
      console.warn('[usePdfLibLinks] Failed to parse annotation:', e);
    }
  }

  return links;
}

export function usePdfLibLinks(
  pdfUrl: string | null,
  pageIndex: number,
): PdfLibLinksResult {
  const [result, setResult] = useState<PdfLibLinksResult>({
    links: [],
    pdfPageWidth: 0,
    pdfPageHeight: 0,
    loading: false,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pdfUrl) {
      setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
      return;
    }

    let cancelled = false;
    setResult((prev) => ({ ...prev, loading: true }));

    const url = pdfUrl; // capture for cleanup closure

    (async () => {
      try {
        const cached = await acquireDocument(url);
        if (cancelled || !mountedRef.current) {
          releaseDocument(url);
          return;
        }

        if (cached.invalidCatalog) {
          setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
          releaseDocument(url);
          return;
        }

        let pageData = cached.pageLinks.get(pageIndex);
        if (!pageData) {
          let pageCount: number;
          try {
            pageCount = cached.doc.getPageCount();
          } catch {
            cached.invalidCatalog = true;
            setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
            releaseDocument(url);
            return;
          }

          if (pageIndex < 0 || pageIndex >= pageCount) {
            setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
            releaseDocument(url);
            return;
          }

          try {
            const page = cached.doc.getPage(pageIndex);
            const { width, height } = page.getSize();
            const links = extractLinksFromPage(cached.doc, page, pageIndex);
            pageData = { links, width, height };
            cached.pageLinks.set(pageIndex, pageData);
          } catch (pageError) {
            console.warn(`[usePdfLibLinks] Failed to read page ${pageIndex}:`, pageError);
            pageData = { links: [], width: 0, height: 0 };
            cached.pageLinks.set(pageIndex, pageData);
          }
        }

        if (!cancelled && mountedRef.current) {
          setResult({
            links: pageData.links,
            pdfPageWidth: pageData.width,
            pdfPageHeight: pageData.height,
            loading: false,
          });
        }

        releaseDocument(url);
      } catch (error) {
        console.warn('[usePdfLibLinks] Failed to extract links:', error);
        if (!cancelled && mountedRef.current) {
          setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageIndex]);

  return result;
}
