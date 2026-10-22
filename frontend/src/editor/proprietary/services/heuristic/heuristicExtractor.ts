// PDFium text extraction feeding the engine: page-1 text, a first-5 + last-2
// page window, Info-dict metadata, and a large-font page-1 "title" zone.

import {
  closeDocAndFreeBuffer,
  extractPageTextItemsForReadAloudFromDoc,
  getMetadataFromDoc,
  getPdfiumModule,
  getRawPageCount,
  getRawPageSize,
  openRawDocumentSafe,
  type ReadAloudTextItem,
} from "@app/services/pdfiumService";
import type { HeuristicDoc } from "@app/services/heuristic/types";
import { getDocumentBytes } from "@app/services/documentBytesCache";

const WINDOW_FIRST = 5;
const WINDOW_LAST = 2;
const PAGE_CHAR_CAP = 8000;
const TITLE_CAP = 400;

export interface ExtractOptions {
  /** Wall-clock budget for reading text, counted from the moment the document is
   *  open, so WASM start-up and the parse of the file's structure are not charged
   *  to it and the first file of a run is not penalised. Pages that do not fit are
   *  dropped and the engine classifies what was read; a document that yields no
   *  text at all before the budget runs out throws, so the caller skips it rather
   *  than filing a verdict on a file nothing was read from. Opening is bounded
   *  separately by {@link OPEN_TIMEOUT_MS}, so the worst case for one file is that
   *  plus this. */
  budgetMs?: number;
}

/** Headroom for opening a document when a budget is set: enough for a cold WASM
 *  module and a damaged cross-reference table to be rebuilt, and still a bound on
 *  an open that will never answer. */
export const OPEN_TIMEOUT_MS = 10_000;

const TIMED_OUT = Symbol("timed-out");

/** `promise`, or {@link TIMED_OUT} once `ms` has passed. The promise itself keeps
 *  running; callers that own a resource behind it must free it on the late path. */
function within<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  if (!Number.isFinite(ms)) return promise;
  if (ms <= 0) return Promise.resolve(TIMED_OUT);
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** One rebuilt text line: baseline y (bottom-origin), its largest font size, and the text. */
interface Line {
  text: string;
  size: number;
  y: number;
}

function textFromWords(words: readonly ReadAloudTextItem[]): string {
  const text = words.map((word) => word.str).join(" ");
  const trimmed = text.trim();
  return trimmed.length > PAGE_CHAR_CAP
    ? trimmed.slice(0, PAGE_CHAR_CAP)
    : trimmed;
}

function buildLines(words: readonly ReadAloudTextItem[]): Line[] {
  const lines: Line[] = [];
  for (const word of words) {
    const y = word.transform[5];
    const size = word.height;
    const line = lines.find(
      (candidate) => Math.abs(candidate.y - y) <= size * 0.5,
    );
    if (line) {
      line.text += ` ${word.str}`;
      line.size = Math.max(line.size, size);
    } else {
      lines.push({ text: word.str, size, y });
    }
  }
  return lines;
}

/** Large-font lines near the top of page 1 approximate the title. */
function titleFromLines(lines: Line[], pageHeight: number): string {
  if (lines.length === 0) return "";
  // PDF y is bottom-origin: the top 45% of the page is y > 0.55 * height.
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

/** First WINDOW_FIRST + last WINDOW_LAST page numbers, deduped, in order. */
function windowPages(pageCount: number): number[] {
  const pages = new Set<number>();
  for (let p = 1; p <= Math.min(WINDOW_FIRST, pageCount); p++) pages.add(p);
  for (let p = Math.max(1, pageCount - WINDOW_LAST + 1); p <= pageCount; p++) {
    pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Build the engine's input document from a PDF blob. Throws if the PDF can't be read,
 *  which under a `budgetMs` includes one that never opens or yields no text in time. */
export async function extractHeuristicDoc(
  file: Blob,
  fileName: string,
  options: ExtractOptions = {},
): Promise<HeuristicDoc> {
  const budgetMs = options.budgetMs ?? Number.POSITIVE_INFINITY;
  const bounded = Number.isFinite(budgetMs);

  const arrayBuffer = await getDocumentBytes(file);
  const m = await getPdfiumModule();
  const opening = openRawDocumentSafe(arrayBuffer);

  let docPtr: number | null = null;
  const opened = bounded
    ? await within(opening, OPEN_TIMEOUT_MS)
    : await opening;
  if (opened === TIMED_OUT) {
    // The open still owns a handle when it lands; free it rather than leaking it.
    void opening
      .then((lateDocPtr) => closeDocAndFreeBuffer(m, lateDocPtr))
      .catch(() => undefined);
    throw new Error(
      `PDF did not open within ${OPEN_TIMEOUT_MS}ms: ${fileName}`,
    );
  }
  docPtr = opened;

  const deadline = Date.now() + budgetMs;
  const remaining = () => deadline - Date.now();

  try {
    const pageCount = await getRawPageCount(docPtr);
    let firstZone = "";
    let titleZone = "";
    if (pageCount >= 1) {
      const page1 = await within(
        extractPageTextItemsForReadAloudFromDoc(docPtr, 0, 1),
        remaining(),
      );
      if (page1 !== TIMED_OUT) {
        firstZone = textFromWords(page1);
        const pageSize = await getRawPageSize(docPtr, 0);
        titleZone = titleFromLines(buildLines(page1), pageSize.height);
      }
    }

    const parts: string[] = [];
    for (const pageNo of windowPages(pageCount)) {
      if (pageNo !== 1 && remaining() <= 0) break;
      const text =
        pageNo === 1
          ? firstZone
          : await within(
              extractPageTextItemsForReadAloudFromDoc(docPtr, pageNo - 1, 1),
              remaining(),
            ).then((words) =>
              words === TIMED_OUT ? "" : textFromWords(words),
            );
      if (text.length > 0) parts.push(text);
    }
    if (parts.length === 0 && remaining() <= 0) {
      throw new Error(
        `Text extraction for ${fileName} produced nothing within ${budgetMs}ms`,
      );
    }

    const rawMeta = await within(getMetadataFromDoc(docPtr), remaining());
    const meta =
      rawMeta === TIMED_OUT
        ? {}
        : Object.fromEntries(
            Object.entries(rawMeta).map(([key, value]) => [
              key.toLowerCase(),
              value,
            ]),
          );
    return {
      fileName,
      pageCount,
      meta,
      titleZone,
      firstZone,
      allZone: parts.join("\n"),
    };
  } finally {
    if (docPtr !== null) closeDocAndFreeBuffer(m, docPtr);
  }
}
