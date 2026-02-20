import { useState, useEffect, useRef } from 'react';
import {
  PDFDocument,
} from '@cantoo/pdf-lib';
import {
  PdfLibLink,
  extractLinksFromPage,
} from '@app/utils/pdfLinkUtils';


export type { PdfLibLink };

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
