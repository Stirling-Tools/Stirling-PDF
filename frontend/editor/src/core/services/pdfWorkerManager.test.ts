import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// A pdf.js worker that dies mid-parse never settles its loading task. Only the manager
// holds that task, so only the manager can free it and the file's bytes with it.

const getDocument = vi.fn();
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import {
  loadPdfjs,
  pdfWorkerManager,
  PdfOpenTimeout,
} from "@app/services/pdfWorkerManager";

/** A loading task that never opens, so only a timeout can end the wait. */
function stalledTask() {
  return { promise: new Promise<never>(() => {}), destroy: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
  getDocument.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("createDocument openTimeoutMs", () => {
  test("destroys the loading task of a document that never opens", async () => {
    const task = stalledTask();
    getDocument.mockReturnValue(task);

    const opening = pdfWorkerManager.createDocument(new ArrayBuffer(8), {
      openTimeoutMs: 500,
    });
    const failed = vi.fn();
    void opening.catch(failed);
    await vi.advanceTimersByTimeAsync(501);

    expect(failed).toHaveBeenCalledWith(expect.any(PdfOpenTimeout));
    expect(task.destroy).toHaveBeenCalled();
  });

  test("leaves no pending timer once a document opens in time", async () => {
    const pdf = { numPages: 1, destroy: () => Promise.resolve() };
    getDocument.mockReturnValue({
      promise: Promise.resolve(pdf),
      destroy: vi.fn(),
    });

    await pdfWorkerManager.createDocument(new ArrayBuffer(8), {
      openTimeoutMs: 500,
    });

    expect(vi.getTimerCount()).toBe(0);
    await pdfWorkerManager.destroyDocument(pdf as never);
  });

  test("without a timeout the caller waits as long as the worker takes", async () => {
    getDocument.mockReturnValue(stalledTask());

    const settled = vi.fn();
    void pdfWorkerManager
      .createDocument(new ArrayBuffer(8))
      .then(settled, settled);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(settled).not.toHaveBeenCalled();
  });
});

describe("loadPdfjs", () => {
  test("points pdf.js at its worker when it first loads", async () => {
    const { GlobalWorkerOptions } = await loadPdfjs();

    expect(GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs$/);
  });

  test("a failed load is not cached, so the next call retries it", async () => {
    let failures = 1;
    vi.resetModules();
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => {
      if (failures-- > 0)
        throw new Error("Failed to fetch dynamically imported module");
      return { GlobalWorkerOptions: {}, getDocument };
    });
    const fresh = await import("@app/services/pdfWorkerManager");

    await expect(fresh.loadPdfjs()).rejects.toThrow();
    const retried = await fresh.loadPdfjs();
    expect(typeof retried.getDocument).toBe("function");
  });
});
