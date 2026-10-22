import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReadAloudTextItem } from "@app/services/pdfiumService";

// The extractor sits between PDFium and the engine. Opening or reading a page can
// stall, and a page can carry more text than the engine would keep; these pin that
// neither holds a caller past its budget, and that running out of time costs a
// document its text, not its classification.

const openRawDocumentSafe = vi.fn();
const closeDocAndFreeBuffer = vi.fn();
const getRawPageCount = vi.fn();
const getRawPageSize = vi.fn();
const extractPageTextItemsForReadAloudFromDoc = vi.fn();
const getMetadataFromDoc = vi.fn();

vi.mock("@app/services/pdfiumService", () => ({
  getPdfiumModule: vi.fn().mockResolvedValue({}),
  openRawDocumentSafe: (...args: unknown[]) => openRawDocumentSafe(...args),
  closeDocAndFreeBuffer: (...args: unknown[]) => closeDocAndFreeBuffer(...args),
  getRawPageCount: (...args: unknown[]) => getRawPageCount(...args),
  getRawPageSize: (...args: unknown[]) => getRawPageSize(...args),
  extractPageTextItemsForReadAloudFromDoc: (...args: unknown[]) =>
    extractPageTextItemsForReadAloudFromDoc(...args),
  getMetadataFromDoc: (...args: unknown[]) => getMetadataFromDoc(...args),
}));

import {
  extractHeuristicDoc,
  OPEN_TIMEOUT_MS,
} from "@app/services/heuristic/heuristicExtractor";

const never = <T>() => new Promise<T>(() => {});

const word = (str: string): ReadAloudTextItem => ({
  str,
  transform: [1, 0, 0, 1, 0, 700],
  width: str.length * 6,
  height: 10,
  viewportTransform: [1, 0, 0, -1, 0, 800],
});

function words(...texts: string[]): ReadAloudTextItem[] {
  return texts.map(word);
}

const pdf = () => new Blob(["%PDF-1.4"], { type: "application/pdf" });

beforeEach(() => {
  vi.useFakeTimers();
  openRawDocumentSafe.mockReset().mockResolvedValue(1);
  closeDocAndFreeBuffer.mockReset();
  getRawPageCount.mockReset().mockResolvedValue(1);
  getRawPageSize.mockReset().mockResolvedValue({ width: 600, height: 800 });
  extractPageTextItemsForReadAloudFromDoc
    .mockReset()
    .mockResolvedValue(words("Invoice", "total due"));
  getMetadataFromDoc.mockReset().mockResolvedValue({ Title: "T" });
});
afterEach(() => vi.useRealTimers());

describe("extractHeuristicDoc with a budget", () => {
  test("a document that never opens is not classified", async () => {
    openRawDocumentSafe.mockReturnValue(never());
    const result = extractHeuristicDoc(pdf(), "Invoice 2026.pdf", {
      budgetMs: 1000,
    });
    const settled = vi.fn();
    void result.catch(settled);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 1);

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
  });

  test("a slow open does not eat the reading budget", async () => {
    let open!: (ptr: number) => void;
    openRawDocumentSafe.mockReturnValue(new Promise((r) => (open = r)));
    const result = extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 });
    await vi.advanceTimersByTimeAsync(4000);
    open(1);
    expect((await result).firstZone).toBe("Invoice total due");
  });

  test("is not classified when page 1's text never answers", async () => {
    extractPageTextItemsForReadAloudFromDoc.mockReturnValue(never());
    const result = extractHeuristicDoc(pdf(), "Bank statement.pdf", {
      budgetMs: 1000,
    });
    const settled = vi.fn();
    void result.catch(settled);
    await vi.advanceTimersByTimeAsync(1001);

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    // Skipping the file must not also leak its document handle.
    expect(closeDocAndFreeBuffer).toHaveBeenCalledTimes(1);
  });

  test("a document that cannot be read at all still throws", async () => {
    openRawDocumentSafe.mockRejectedValue(new Error("InvalidPDFException"));
    await expect(
      extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 }),
    ).rejects.toThrow("InvalidPDFException");
  });

  test("keeps what was read when a later page runs out of budget", async () => {
    getRawPageCount.mockResolvedValue(2);
    extractPageTextItemsForReadAloudFromDoc
      .mockResolvedValueOnce(words("Invoice", "total due"))
      .mockReturnValueOnce(never());
    const result = extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    const extracted = await result;
    expect(extracted.firstZone).toBe("Invoice total due");
    expect(extracted.allZone).toBe("Invoice total due");
  });

  test("caps the text a single page contributes", async () => {
    extractPageTextItemsForReadAloudFromDoc.mockResolvedValue(
      Array.from({ length: 2000 }, (_, i) => word(`w${i}-${"x".repeat(100)}`)),
    );
    const extracted = await extractHeuristicDoc(pdf(), "a.pdf");
    expect(extracted.firstZone.length).toBeLessThanOrEqual(8000);
  });

  test("no budget means no deadline, opening included", async () => {
    let release!: (ptr: number) => void;
    openRawDocumentSafe.mockReturnValue(new Promise((r) => (release = r)));
    const result = extractHeuristicDoc(pdf(), "a.pdf");
    await vi.advanceTimersByTimeAsync(60_000);
    release(1);
    expect((await result).firstZone).toBe("Invoice total due");
    expect(openRawDocumentSafe).toHaveBeenCalledWith(expect.anything());
  });
});
