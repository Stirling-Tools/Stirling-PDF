import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/tools/pdfTextEditor/pdfium/PdfiumTextReader", () => ({
  PdfiumTextReader: {
    recapturePositions: vi.fn(() => new Set()),
    populate: vi.fn(),
  },
}));

import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";

interface FakePage {
  index: number;
  dirty: boolean;
  revision: number;
  runs: never[];
  loaded: boolean;
}

function fakeStore(pages: FakePage[]) {
  const store = new EditorStore();
  const doc = {
    loadedPages: () => pages,
    page: (i: number) => pages[i],
  };
  return { store, doc };
}

function editCommand(page: FakePage) {
  return {
    apply: () => {
      page.dirty = true;
      page.revision += 1;
    },
    revert: () => {},
  } as unknown as Command;
}

describe("EditorStore position refresh filter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(PdfiumTextReader.recapturePositions).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recaptures only the edited page on the debounce tick", async () => {
    const pages: FakePage[] = [
      { index: 0, dirty: false, revision: 0, runs: [], loaded: true },
      { index: 1, dirty: false, revision: 0, runs: [], loaded: true },
    ];
    const { store, doc } = fakeStore(pages);
    // Bypass setDocument: only the doc field and seed map matter here.
    (store as unknown as { doc: unknown }).doc = doc;
    store.publishPages([]);
    store.dispatch(editCommand(pages[0]));
    await vi.advanceTimersByTimeAsync(1000);
    const calls = vi.mocked(PdfiumTextReader.recapturePositions).mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][1]).toBe(pages[0]);
  });

  it("skips every page when nothing changed since the last tick", async () => {
    const pages: FakePage[] = [
      { index: 0, dirty: false, revision: 0, runs: [], loaded: true },
    ];
    const { store, doc } = fakeStore(pages);
    (store as unknown as { doc: unknown }).doc = doc;
    store.publishPages([]);
    store.dispatch(editCommand(pages[0]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      vi.mocked(PdfiumTextReader.recapturePositions).mock.calls.length,
    ).toBe(1);
    // Settle the page: clean and already seen, so a later tick is a no-op.
    pages[0].dirty = false;
    store.dispatch({ apply: () => {}, revert: () => {} } as unknown as Command);
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      vi.mocked(PdfiumTextReader.recapturePositions).mock.calls.length,
    ).toBe(1);
  });
});
