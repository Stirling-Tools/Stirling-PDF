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
} from 'pdf-lib';


export type LinkType = 'internal' | 'external' | 'unknown';

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
}

const docCache = new Map<string, Promise<CachedDoc>>();

async function acquireDocument(url: string): Promise<CachedDoc> {
  if (!docCache.has(url)) {
    const promise = (async (): Promise<CachedDoc> => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const doc = await PDFDocument.load(new Uint8Array(buffer), {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
      return { doc, refCount: 0, pageLinks: new Map() };
    })();
    docCache.set(url, promise);
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
    // Swallow – named dest resolution is best-effort
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

      links.push({
        id: `pdflib-link-${pageIndex}-${i}`,
        annotIndex: i,
        rect: { x: left, y: top, width, height },
        type: linkType,
        targetPage,
        uri,
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

        let pageData = cached.pageLinks.get(pageIndex);
        if (!pageData) {
          const pageCount = cached.doc.getPageCount();
          if (pageIndex < 0 || pageIndex >= pageCount) {
            setResult({ links: [], pdfPageWidth: 0, pdfPageHeight: 0, loading: false });
            releaseDocument(url);
            return;
          }

          const page = cached.doc.getPage(pageIndex);
          const { width, height } = page.getSize();
          const links = extractLinksFromPage(cached.doc, page, pageIndex);
          pageData = { links, width, height };
          cached.pageLinks.set(pageIndex, pageData);
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
        console.error('[usePdfLibLinks] Failed to extract links:', error);
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
