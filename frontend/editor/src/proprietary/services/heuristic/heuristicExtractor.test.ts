import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The extractor sits between a pdf.js worker and the engine. A worker can stall or
// die without ever answering, and a page can carry millions of text operators the
// engine would trim anyway; these pin that neither holds a caller past its budget,
// and that running out of time costs a document its text, not its classification.

const createDocument = vi.fn();
const destroyDocument = vi.fn();
vi.mock("@app/services/pdfWorkerManager", () => {
  class PdfOpenTimeout extends Error {
    constructor(timeoutMs: number) {
      super(`PDF did not open within ${timeoutMs}ms`);
      this.name = "PdfOpenTimeout";
    }
  }
  return {
    PdfOpenTimeout,
    pdfWorkerManager: {
      // Mirrors the real manager's open bound, which is the half of the contract the
      // extractor leans on; the manager's own test covers freeing the loading task.
      createDocument: (
        data: unknown,
        options: { openTimeoutMs?: number } = {},
      ) => {
        const opening = createDocument(data, options);
        const { openTimeoutMs } = options;
        return openTimeoutMs === undefined
          ? opening
          : Promise.race([
              opening,
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new PdfOpenTimeout(openTimeoutMs)),
                  openTimeoutMs,
                ),
              ),
            ]);
      },
      destroyDocument: (...args: unknown[]) => destroyDocument(...args),
    },
  };
});

import {
  extractHeuristicDoc,
  OPEN_TIMEOUT_MS,
} from "@app/services/heuristic/heuristicExtractor";

const never = <T>() => new Promise<T>(() => {});
const item = (str: string) => ({
  str,
  hasEOL: false,
  transform: [10, 0, 0, 10, 0, 700],
});

/** A page whose text arrives as `chunks`, then follows `tail` (default: closes).
 *  `firstReadGate` holds the first read until it resolves. */
function page(
  chunks: string[][],
  tail: "close" | "hang" = "close",
  firstReadGate?: Promise<void>,
) {
  const cancel = vi.fn(() => Promise.resolve());
  let index = 0;
  const next = (): Promise<{ value: unknown; done: boolean }> => {
    if (index < chunks.length) {
      const items = chunks[index++].map(item);
      return Promise.resolve({ value: { items }, done: false });
    }
    return tail === "close"
      ? Promise.resolve({ value: undefined, done: true })
      : never<{ value: unknown; done: boolean }>();
  };
  const reader = {
    read: () =>
      firstReadGate && index === 0 ? firstReadGate.then(next) : next(),
    cancel,
  };
  return {
    streamTextContent: () => ({ getReader: () => reader }),
    getViewport: () => ({ height: 800 }),
    cleanup: () => {},
    cancel,
  };
}

function doc(pages: ReturnType<typeof page>[]) {
  return {
    numPages: pages.length,
    getPage: (n: number) => Promise.resolve(pages[n - 1]),
    getMetadata: () => Promise.resolve({ info: { Title: "T" } }),
  };
}

const pdf = () => new Blob(["%PDF-1.4"], { type: "application/pdf" });

beforeEach(() => {
  vi.useFakeTimers();
  createDocument.mockReset();
  destroyDocument.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("extractHeuristicDoc with a budget", () => {
  test("a document that never opens is not classified", async () => {
    createDocument.mockReturnValue(never());
    const result = extractHeuristicDoc(pdf(), "Invoice 2026.pdf", {
      budgetMs: 1000,
    });
    const settled = vi.fn();
    void result.catch(settled);
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 1);

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
  });

  test("a slow open does not eat the reading budget", async () => {
    // The first file of a run boots the pdf.js worker; that must not cost it its text.
    let open!: (d: unknown) => void;
    createDocument.mockReturnValue(new Promise((r) => (open = r)));
    const result = extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 });
    await vi.advanceTimersByTimeAsync(4000);
    open(doc([page([["Invoice", "total due"]])]));
    expect((await result).firstZone).toBe("Invoice total due");
  });

  test("is not classified when page 1's stream never answers", async () => {
    createDocument.mockResolvedValue(doc([page([], "hang")]));
    const result = extractHeuristicDoc(pdf(), "Bank statement.pdf", {
      budgetMs: 1000,
    });
    const settled = vi.fn();
    void result.catch(settled);
    await vi.advanceTimersByTimeAsync(1001);

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
    // Skipping the file must not also leak its worker.
    expect(destroyDocument).toHaveBeenCalledTimes(1);
  });

  test("a document that cannot be read at all still throws", async () => {
    createDocument.mockRejectedValue(new Error("InvalidPDFException"));
    await expect(
      extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 }),
    ).rejects.toThrow("InvalidPDFException");
  });

  test("keeps what was read when a later page runs out of budget", async () => {
    createDocument.mockResolvedValue(
      doc([page([["Invoice", "total due"]]), page([], "hang")]),
    );
    const result = extractHeuristicDoc(pdf(), "a.pdf", { budgetMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    const extracted = await result;
    expect(extracted.firstZone).toBe("Invoice total due");
    expect(extracted.allZone).toBe("Invoice total due");
  });

  test("stops reading a page once the engine's cap is reached", async () => {
    // Endless chunks of 1000 characters: without a stop this never returns.
    const chunk = Array.from({ length: 10 }, () => "x".repeat(100));
    const endless = page(Array.from({ length: 1_000_000 }, () => chunk));
    createDocument.mockResolvedValue(doc([endless]));
    const extracted = await extractHeuristicDoc(pdf(), "a.pdf");
    expect(extracted.firstZone.length).toBeLessThanOrEqual(8000);
    expect(endless.cancel).toHaveBeenCalled();
  });

  test("no budget means no deadline, opening included", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    createDocument.mockResolvedValue(
      doc([page([["late text"]], "close", gate)]),
    );
    const result = extractHeuristicDoc(pdf(), "a.pdf");
    await vi.advanceTimersByTimeAsync(60_000);
    release();
    expect((await result).firstZone).toBe("late text");
    expect(createDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ openTimeoutMs: undefined }),
    );
  });
});
