// pdf.js extraction feeding the engine: page-1 text, a first-5 + last-2 page
// window, Info-dict metadata, and a large-font page-1 "title" zone.

import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import type {
  PDFDocumentProxy,
  TextItem,
} from "pdfjs-dist/types/src/display/api";
import type { HeuristicDoc } from "@app/services/heuristic/types";

const WINDOW_FIRST = 5;
const WINDOW_LAST = 2;
const PAGE_CHAR_CAP = 8000;
const TITLE_CAP = 400;

/** One rebuilt text line: baseline y (bottom-origin), its largest font size, and the text. */
interface Line {
  text: string;
  size: number;
  y: number;
}

/** Build the engine's input document from a PDF blob. Throws if the PDF can't be read. */
export async function extractHeuristicDoc(
  file: Blob,
  fileName: string,
): Promise<HeuristicDoc> {
  const arrayBuffer = await file.arrayBuffer();
  let pdfDoc: PDFDocumentProxy | null = null;
  try {
    pdfDoc = await pdfWorkerManager.createDocument(arrayBuffer, {
      disableAutoFetch: true,
      disableStream: true,
    });
    const pageCount = pdfDoc.numPages;
    let firstZone = "";
    let titleZone = "";
    if (pageCount >= 1) {
      // Page 1 feeds three zones (first, title, window); pump its items once.
      const page1 = await pdfDoc.getPage(1);
      const items = await pageTextItems(page1);
      firstZone = textFromItems(items);
      titleZone = titleFromLines(
        buildLines(items),
        page1.getViewport({ scale: 1 }).height,
      );
    }
    const parts: string[] = [];
    for (const pageNo of windowPages(pageCount)) {
      const text = pageNo === 1 ? firstZone : await pageText(pdfDoc, pageNo);
      if (text.length > 0) parts.push(text);
    }
    const meta = await metadata(pdfDoc);
    return {
      fileName,
      pageCount,
      meta,
      titleZone,
      firstZone,
      allZone: parts.join("\n"),
    };
  } finally {
    if (pdfDoc) {
      try {
        pdfWorkerManager.destroyDocument(pdfDoc);
      } catch {
        // Best-effort cleanup.
      }
    }
  }
}

/** First WINDOW_FIRST + last WINDOW_LAST page numbers, deduped, in order. */
function windowPages(pageCount: number): number[] {
  const pages = new Set<number>();
  for (let p = 1; p <= Math.min(WINDOW_FIRST, pageCount); p++) pages.add(p);
  for (let p = Math.max(1, pageCount - WINDOW_LAST + 1); p <= pageCount; p++) {
    pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as TextItem).str === "string";
}

/**
 * Pump text items with a plain reader loop: Safari/WebKit cannot async-iterate
 * the ReadableStream behind pdf.js getTextContent.
 */
async function pageTextItems(
  page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>,
): Promise<unknown[]> {
  const reader = page.streamTextContent().getReader();
  const items: unknown[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (Array.isArray(value?.items)) items.push(...value.items);
  }
  return items;
}

/** A page's text (items joined, newline on hasEOL), trimmed and capped. */
async function pageText(
  pdfDoc: PDFDocumentProxy,
  pageNo: number,
): Promise<string> {
  if (pageNo < 1 || pageNo > pdfDoc.numPages) return "";
  const page = await pdfDoc.getPage(pageNo);
  return textFromItems(await pageTextItems(page));
}

function textFromItems(items: readonly unknown[]): string {
  let text = "";
  for (const item of items) {
    if (!isTextItem(item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  const trimmed = text.trim();
  return trimmed.length > PAGE_CHAR_CAP
    ? trimmed.slice(0, PAGE_CHAR_CAP)
    : trimmed;
}

/** Group items into lines (break on hasEOL), tracking each line's max font size + baseline y. */
function buildLines(items: readonly unknown[]): Line[] {
  const lines: Line[] = [];
  let current = "";
  let size = 0;
  let y = -1;
  const flush = () => {
    const text = current.trim();
    if (text.length > 0) lines.push({ text, size, y });
    current = "";
    size = 0;
    y = -1;
  };
  for (const item of items) {
    if (!isTextItem(item)) continue;
    const itemSize = Math.hypot(item.transform[0], item.transform[1]);
    if (itemSize > size) size = itemSize;
    if (y < 0) y = item.transform[5];
    current += item.str;
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/** Large-font lines near the top of page 1 approximate the title. */
function titleFromLines(lines: Line[], pageHeight: number): string {
  if (lines.length === 0) return "";
  // pdf.js y is bottom-origin: the top 45% of the page is y > 0.55 * height.
  const top = lines.filter((l) => l.y > pageHeight * 0.55);
  const pool = top.length > 0 ? top : lines.slice(0, Math.min(8, lines.length));
  let maxSize = 0;
  for (const l of pool) maxSize = Math.max(maxSize, l.size);

  const parts: string[] = [];
  if (maxSize === 0) {
    for (let i = 0; i < Math.min(3, pool.length); i++) parts.push(pool[i].text);
    return parts.join("\n");
  }
  let taken = 0;
  for (const l of pool) {
    if (taken >= 6) break;
    if (l.size >= maxSize * 0.72) {
      parts.push(l.text);
      taken++;
    }
  }
  const result = parts.join("\n");
  return result.length > TITLE_CAP ? result.slice(0, TITLE_CAP) : result;
}

/** Info-dict fields keyed lowercase to match the engine's metadata rules. */
async function metadata(
  pdfDoc: PDFDocumentProxy,
): Promise<Record<string, string>> {
  let info: Record<string, unknown> = {};
  try {
    const md = await pdfDoc.getMetadata();
    info = (md.info ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
  const get = (k: string) =>
    typeof info[k] === "string" ? (info[k] as string) : "";
  return {
    title: get("Title"),
    author: get("Author"),
    subject: get("Subject"),
    keywords: get("Keywords"),
    creator: get("Creator"),
    producer: get("Producer"),
  };
}
