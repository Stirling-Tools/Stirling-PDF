import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// A pdf.js worker that dies mid-parse never settles its loading task. Only the manager
// holds that task, so only the manager can free it and the file's bytes with it.

const getDocument = vi.fn();
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import {
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
    let resolve!: (pdf: never) => void;
    const promise = new Promise<never>((done) => {
      resolve = done;
    });
    getDocument.mockReturnValue({ promise, destroy: vi.fn() });

    const settled = vi.fn();
    const opening = pdfWorkerManager.createDocument(new ArrayBuffer(8));
    void opening.then(settled, settled);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(settled).not.toHaveBeenCalled();
    const pdf = { numPages: 1, destroy: () => Promise.resolve() };
    resolve(pdf as never);
    await opening;
    await pdfWorkerManager.destroyDocument(pdf as never);
  });
});

test("opening documents reserve worker slots before PDF.js resolves", async () => {
  pdfWorkerManager.setMaxWorkers(2);
  const resolvers: Array<(pdf: never) => void> = [];
  getDocument.mockImplementation(() => ({
    promise: new Promise((resolve) => resolvers.push(resolve)),
    destroy: vi.fn(),
  }));
  const signal = { cancelled: false };
  const requests = Array.from({ length: 20 }, () =>
    pdfWorkerManager
      .createDocument(new ArrayBuffer(8), { signal })
      .catch(() => null),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(getDocument).toHaveBeenCalledTimes(2);
  signal.cancelled = true;
  for (const resolve of resolvers) {
    resolve({ numPages: 1, destroy: () => Promise.resolve() } as never);
  }
  await vi.advanceTimersByTimeAsync(101);
  const documents = await Promise.all(requests);
  for (const document of documents) {
    if (document) await pdfWorkerManager.destroyDocument(document);
  }
  expect(pdfWorkerManager.getWorkerStats().opening).toBe(0);
  pdfWorkerManager.setMaxWorkers(10);
});
