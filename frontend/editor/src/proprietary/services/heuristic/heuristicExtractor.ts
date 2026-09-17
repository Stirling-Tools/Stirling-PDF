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

export interface ExtractOptions {
  /** Wall-clock budget for reading text, counted from the moment the document is
   *  open, so pdf.js worker start-up and the parse of the file's structure are not
   *  charged to it and the first file of a run is not penalised. Pages that do not
   *  fit are dropped and the engine classifies what was read; a file that yields
   *  nothing at all inside it fails with {@link HeuristicExtractionTimeout}. Opening
   *  itself is bounded by {@link OPEN_TIMEOUT_MS} whenever a budget is set. */
  budgetMs?: number;
}

/** Headroom for opening a document when a budget is set: enough for a cold worker and
 *  a damaged cross-reference table to be rebuilt, and still a bound on a worker that
 *  will never answer. */
export const OPEN_TIMEOUT_MS = 10_000;

/** The file produced no text inside its budget: broken, hostile, or a worker that
 *  died mid-parse and will never answer. */
export class HeuristicExtractionTimeout extends Error {
  constructor(fileName: string, budgetMs: number) {
    super(
      `Text extraction for ${fileName} produced nothing within ${budgetMs}ms`,
    );
    this.name = "HeuristicExtractionTimeout";
  }
}

const TIMED_OUT = Symbol("timed-out");

/** `promise`, or {@link TIMED_OUT} once `ms` has passed. The promise itself keeps
 *  running; callers that own a resource behind it must free it on the late path. */
function within<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  if (!Number.isFinite(ms)) return promise;
  if (ms <= 0) return Promise.resolve(TIMED_OUT);
  return Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) =>
      setTimeout(() => resolve(TIMED_OUT), ms),
    ),
  ]);
}

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
  options: ExtractOptions = {},
): Promise<HeuristicDoc> {
  const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
  const bounded = Number.isFinite(budgetMs);

  const arrayBuffer = await file.arrayBuffer();
  const opening = pdfWorkerManager.createDocument(arrayBuffer, {
    disableAutoFetch: true,
    disableStream: true,
  });
  const opened = await within(
    opening,
    bounded ? OPEN_TIMEOUT_MS : Number.POSITIVE_INFINITY,
  );
  if (opened === TIMED_OUT) {
    // Arrives after we stopped waiting: nothing else would free its worker.
    void opening
      .then((pdf) => pdfWorkerManager.destroyDocument(pdf))
      .catch(() => {});
    throw new HeuristicExtractionTimeout(fileName, OPEN_TIMEOUT_MS);
  }
  const pdfDoc = opened;
  const deadline = Date.now() + budgetMs;
  const remaining = () => deadline - Date.now();
  try {
    const pageCount = pdfDoc.numPages;
    let firstZone = "";
    let titleZone = "";
    if (pageCount >= 1) {
      // Page 1 feeds three zones (first, title, window); pump its items once.
      const page1 = await within(pdfDoc.getPage(1), remaining());
      if (page1 !== TIMED_OUT) {
        try {
          const items = await pageTextItems(page1, remaining);
          firstZone = textFromItems(items);
          titleZone = titleFromLines(
            buildLines(items),
            page1.getViewport({ scale: 1 }).height,
          );
        } finally {
          page1.cleanup();
        }
      }
    }
    const parts: string[] = [];
    for (const pageNo of windowPages(pageCount)) {
      if (pageNo !== 1 && remaining() <= 0) break;
      const text =
        pageNo === 1 ? firstZone : await pageText(pdfDoc, pageNo, remaining);
      if (text.length > 0) parts.push(text);
    }
    if (parts.length === 0 && remaining() <= 0) {
      throw new HeuristicExtractionTimeout(fileName, budgetMs);
    }
    const meta = await metadata(pdfDoc, remaining);
    return {
      fileName,
      pageCount,
      meta,
      titleZone,
      firstZone,
      allZone: parts.join("\n"),
    };
  } finally {
    try {
      pdfWorkerManager.destroyDocument(pdfDoc);
    } catch {
      // Best-effort cleanup.
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
 * the ReadableStream behind pdf.js getTextContent. Stops at the page cap or the
 * deadline, whichever first: the engine never sees more than the cap, so letting
 * the worker walk a million-operator page to the end would be pure cost.
 */
async function pageTextItems(
  page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>,
  remaining: () => number,
): Promise<unknown[]> {
  const reader = page.streamTextContent().getReader();
  const items: unknown[] = [];
  let chars = 0;
  try {
    for (;;) {
      const next = await within(reader.read(), remaining());
      if (next === TIMED_OUT) return items;
      const { value, done } = next;
      if (done) return items;
      if (Array.isArray(value?.items)) {
        for (const item of value.items) {
          items.push(item);
          if (isTextItem(item)) chars += item.str.length;
        }
      }
      if (chars >= PAGE_CHAR_CAP) return items;
    }
  } finally {
    // Tells the worker to stop walking this page. A no-op once the stream is done.
    void reader.cancel().catch(() => {});
  }
}

/** A page's text (items joined, newline on hasEOL), trimmed and capped. */
async function pageText(
  pdfDoc: PDFDocumentProxy,
  pageNo: number,
  remaining: () => number,
): Promise<string> {
  if (pageNo < 1 || pageNo > pdfDoc.numPages) return "";
  const page = await within(pdfDoc.getPage(pageNo), remaining());
  if (page === TIMED_OUT) return "";
  try {
    return textFromItems(await pageTextItems(page, remaining));
  } finally {
    page.cleanup();
  }
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
  remaining: () => number,
): Promise<Record<string, string>> {
  let info: Record<string, unknown> = {};
  try {
    const md = await within(pdfDoc.getMetadata(), remaining());
    if (md === TIMED_OUT) return {};
    info = (md.info ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
  const get = (k: string) => (typeof info[k] === "string" ? info[k] : "");
  return {
    title: get("Title"),
    author: get("Author"),
    subject: get("Subject"),
    keywords: get("Keywords"),
    creator: get("Creator"),
    producer: get("Producer"),
  };
}
