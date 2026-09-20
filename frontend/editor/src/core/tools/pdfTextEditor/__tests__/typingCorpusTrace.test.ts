import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Corpus open/save timings plus network/disk traces for the typing path.
// Backend-free: the charcode endpoint and the PDF serializer are mocked, so
// the numbers isolate client batching (one request per font, one serialize
// per burst window) from server latency.

vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@app/tools/pdfTextEditor/pdfium/PdfiumSave", () => ({
  PdfiumSave: { serialize: vi.fn(() => new Uint8Array([0, 1, 2, 3])) },
}));

import apiClient from "@app/services/apiClient";
import { PdfiumSave } from "@app/tools/pdfTextEditor/pdfium/PdfiumSave";
import {
  BackendResolver,
  resetBackendResolverCaches,
  _clearBackendCacheForTests,
  _clearPrewarmGuardForTests,
} from "@app/tools/pdfTextEditor/charcode/BackendResolver";
import { _clearCmapCacheForTests } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import type { ResolverContext } from "@app/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { RawPdf } from "@app/tools/pdfTextEditor/pdfdoc/raw";
import { consolidateContents } from "@app/tools/pdfTextEditor/pdfdoc/passes/consolidateContents";
import {
  buildClassicPdf,
  singleContentPdf,
  streamBody,
} from "@app/tools/pdfTextEditor/__tests__/pdfFixtures";

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const serialize = PdfiumSave.serialize as unknown as ReturnType<typeof vi.fn>;

/** N-page synthetic corpus: catalog + Pages + one content stream per page. */
function manyPagePdf(pages: number): Uint8Array {
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 2} 0 R`).join(
    " ",
  );
  const objects: { num: number; body: string }[] = [
    { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { num: 2, body: `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>` },
  ];
  for (let i = 0; i < pages; i += 1) {
    const pageNum = 3 + i * 3;
    const streamA = 4 + i * 3;
    const streamB = 5 + i * 3;
    objects.push({
      num: pageNum,
      body: `<< /Type /Page /Parent 2 0 R /Contents [${streamA} 0 R ${streamB} 0 R] >>`,
    });
    objects.push({
      num: streamA,
      body: streamBody("", `q BT /F1 12 Tf 72 720 Td (Page ${i}a) Tj ET`),
    });
    objects.push({
      num: streamB,
      body: streamBody("", `Q`),
    });
  }
  return buildClassicPdf(objects, 1);
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("typing corpus open/save", () => {
  it("parses a 1-page corpus fast", async () => {
    const bytes = singleContentPdf();
    const t0 = performance.now();
    const pdf = await RawPdf.parse(bytes);
    const dt = performance.now() - t0;
    console.log(
      `[corpus] parse 1 page: ${bytes.length}B in ${dt.toFixed(2)}ms`,
    );
    expect(pdf?.rootNum).toBe(1);
    expect(dt).toBeLessThan(2000);
  });

  it("parses a 300-page corpus with near-linear scaling", async () => {
    const bytes = manyPagePdf(300);
    const t0 = performance.now();
    const pdf = await RawPdf.parse(bytes);
    const dt = performance.now() - t0;
    console.log(
      `[corpus] parse 300 pages: ${(bytes.length / 1024).toFixed(0)}KB in ${dt.toFixed(2)}ms`,
    );
    expect(pdf?.pageNumbers()).toHaveLength(300);
    expect(dt).toBeLessThan(15_000);
  });

  it("runs the consolidate-contents save pass over 300 pages, fast", async () => {
    const bytes = manyPagePdf(300);
    const t0 = performance.now();
    const result = await consolidateContents(bytes);
    const dt = performance.now() - t0;
    console.log(`[corpus] consolidate 300 pages in ${dt.toFixed(2)}ms`);
    expect(result).not.toBeNull();
    expect(dt).toBeLessThan(15_000);
  });
});

describe("typing network/disk trace", () => {
  beforeEach(() => {
    post.mockReset();
    serialize.mockClear();
    resetBackendResolverCaches();
    _clearBackendCacheForTests();
    _clearPrewarmGuardForTests();
    _clearCmapCacheForTests();
    delete (window as unknown as { __editor_store?: unknown }).__editor_store;
  });

  afterEach(() => {
    post.mockReset();
    vi.restoreAllMocks();
    delete (window as unknown as { __editor_store?: unknown }).__editor_store;
  });

  it("coalesces a cold-cache typing burst into one flight per font", async () => {
    post.mockResolvedValue({ data: { charcodes: [65], missing: [] } });
    // Fake editor document so the background prefetch can serialize.
    (window as unknown as { __editor_store?: unknown }).__editor_store = {
      document: {
        module: {},
        docPtr: 4242,
        loadedPages: () => [{ index: 0, pagePtr: 9001, docPtr: 4242 }],
      },
    };
    const ctx: ResolverContext = {
      module: {} as unknown as ResolverContext["module"],
      pagePtr: 9001,
      docPtr: 4242,
    };
    // Three rapid keystrokes with a cold cache: without per-font coalescing
    // each key fires its own POST carrying the whole document.
    const r = new BackendResolver();
    const t0 = performance.now();
    for (const ch of ["A", "B", "C"]) {
      r.resolve(7, ch, ctx);
    }
    await waitUntil(() => post.mock.calls.length > 0);
    await new Promise((rr) => setTimeout(rr, 100));
    const dt = performance.now() - t0;
    const payloadBytes = post.mock.calls.reduce(
      (n, [_, body]) =>
        n + JSON.stringify(body as Record<string, unknown>).length,
      0,
    );
    console.log(
      `[trace] 3-key cold burst: ${post.mock.calls.length} POST, ` +
        `${serialize.mock.calls.length} serialize, ${payloadBytes}B payload in ${dt.toFixed(2)}ms`,
    );
    expect(serialize.mock.calls.length).toBe(1);
    expect(post.mock.calls.length).toBe(1);
    expect(dt).toBeLessThan(5000);
  });

  it("re-arms the font flight after completion (no stuck guard)", async () => {
    post.mockResolvedValue({ data: { charcodes: [65], missing: [] } });
    (window as unknown as { __editor_store?: unknown }).__editor_store = {
      document: {
        module: {},
        docPtr: 4242,
        loadedPages: () => [{ index: 0, pagePtr: 9001, docPtr: 4242 }],
      },
    };
    const ctx: ResolverContext = {
      module: {} as unknown as ResolverContext["module"],
      pagePtr: 9001,
      docPtr: 4242,
    };
    const r = new BackendResolver();
    r.resolve(7, "A", ctx);
    await waitUntil(() => post.mock.calls.length === 1);
    // A later keystroke for a still-missing char must fire again once the
    // first flight has landed and cleared the per-font guard.
    r.resolve(7, "Q", ctx);
    await waitUntil(() => post.mock.calls.length === 2);
    expect(post.mock.calls.length).toBe(2);
  });
});
