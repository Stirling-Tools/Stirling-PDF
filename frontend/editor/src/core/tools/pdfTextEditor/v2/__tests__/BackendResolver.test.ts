import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for `BackendResolver`'s HTTP transport.
 *
 * Why this test exists: we previously rolled a custom `fetch()` inside
 * BackendResolver that bypassed every concern the shared `apiClient`
 * already handles (JWT auth header, XSRF, credentials, token refresh).
 * That regressed silently the moment the Spring backend enabled the
 * security profile - every probe returned 401, the prewarm cache
 * stayed empty, and the per-char emit branch in editTextHelpers had
 * nothing to look up. The user reported "the M-glyph fix is broken"
 * and the broken code path had ZERO test coverage.
 *
 * These assertions pin the resolver to the shared apiClient so future
 * refactors can't sneak around it: any encode-charcodes POST must go
 * through `apiClient.post`, which means automatic auth + the
 * `suppressErrorToast` flag we set explicitly to keep prewarm probes
 * from popping toasts. We drive the REAL transport via
 * `prewarmBackendCacheForPage`, which is the only public entry that
 * reaches `postCharcodes`, with a faked PDFium module + editor store.
 */

// Mock apiClient BEFORE BackendResolver imports it.
vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn() },
}));

// Stub the document serializer so the prewarm path can produce PDF bytes
// without a real PDFium file-writer. The bytes themselves are irrelevant
// to the transport assertions - we just need a non-empty buffer.
vi.mock("@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave", () => ({
  PdfiumSave: { serialize: vi.fn(() => new Uint8Array([0, 1, 2, 3])) },
}));

import apiClient from "@app/services/apiClient";
import {
  BackendResolver,
  prewarmBackendCacheForPage,
  resetBackendResolverCaches,
  _clearBackendCacheForTests,
  _clearPrewarmGuardForTests,
} from "@app/tools/pdfTextEditor/v2/charcode/BackendResolver";
import type { ResolverContext } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

// Minimal stub for ResolverContext - the resolver path under test
// never dereferences pagePtr/docPtr/module for cache lookup; the
// auto-prefetch fall-through DOES, but it's gated by absence of a
// loaded editor document on window so it bails early in this env.
const fakeCtx: ResolverContext = {
  module: {} as unknown as ResolverContext["module"],
  pagePtr: 0,
  docPtr: 0,
};

/**
 * Build a fake PDFium module that renders a single char on a page so the
 * prewarm text-walk finds exactly one (font, char) probe to fire. `char`
 * is the Unicode codepoint of the only glyph on the page; `fontPtr` is the
 * font handle the prewarm caches the charcode under.
 */
function makeFakeModule(char: string, fontPtr: number) {
  const cp = char.codePointAt(0) ?? 0;
  const TEXT_PAGE = 555;
  const TEXT_OBJ = 777;
  return {
    FPDFText_LoadPage: vi.fn(() => TEXT_PAGE),
    FPDFText_ClosePage: vi.fn(),
    FPDFText_CountChars: vi.fn(() => 1),
    FPDFText_GetUnicode: vi.fn(() => cp),
    FPDFText_GetTextObject: vi.fn(() => TEXT_OBJ),
    FPDFTextObj_GetFont: vi.fn(() => fontPtr),
  } as unknown as ResolverContext["module"];
}

/**
 * Fake PDFium module rendering an arbitrary sequence of glyphs, each with its
 * own font handle. `glyphs` is a list of [char, fontPtr] in page reading order.
 * Used to exercise the prewarm batching + cross-font cache-key paths.
 */
function makeFakeModulePage(glyphs: Array<[string, number]>) {
  const TEXT_PAGE = 555;
  const OBJ_BASE = 1000;
  return {
    FPDFText_LoadPage: vi.fn(() => TEXT_PAGE),
    FPDFText_ClosePage: vi.fn(),
    FPDFText_CountChars: vi.fn(() => glyphs.length),
    FPDFText_GetUnicode: vi.fn(
      (_tp: number, i: number) => glyphs[i][0].codePointAt(0) ?? 0,
    ),
    FPDFText_GetTextObject: vi.fn((_tp: number, i: number) => OBJ_BASE + i),
    FPDFTextObj_GetFont: vi.fn((obj: number) => glyphs[obj - OBJ_BASE][1]),
  } as unknown as ResolverContext["module"];
}

/** Poll until `predicate` is true (async prefetch settles) or time out. */
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
}

/**
 * Install a fake editor document on window so `prewarmBackendCacheForPage`
 * resolves a page + module instead of bailing on "no-editor-ctx".
 */
function installEditorDocument(
  module: ResolverContext["module"],
  pagePtr: number,
  docPtr: number,
) {
  const doc = {
    module,
    docPtr,
    loadedPages: () => [{ index: 0, pagePtr, docPtr }],
  };
  (window as unknown as { __v2_editor_store?: unknown }).__v2_editor_store = {
    document: doc,
  };
}

beforeEach(() => {
  post.mockReset();
  resetBackendResolverCaches();
  _clearBackendCacheForTests();
  _clearPrewarmGuardForTests();
  delete (window as unknown as { __v2_editor_store?: unknown })
    .__v2_editor_store;
});

afterEach(() => {
  post.mockReset();
  vi.restoreAllMocks();
  delete (window as unknown as { __v2_editor_store?: unknown })
    .__v2_editor_store;
});

describe("BackendResolver", () => {
  describe("HTTP transport via shared apiClient (regression #111)", () => {
    it("routes the encode POST through apiClient.post with the suppressErrorToast header", async () => {
      // One glyph 'M' on the page, rendered by font handle 7. Prewarm walks
      // the page, finds one probe, serializes the doc (mocked) and POSTs.
      const module = makeFakeModule("M", 7);
      installEditorDocument(module, 9001, 4242);
      post.mockResolvedValueOnce({ data: { charcodes: [182] } });

      await prewarmBackendCacheForPage(0);

      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        "/api/v1/general/pdf-text-editor-v2/encode-charcodes",
        expect.objectContaining({
          pdfBase64: expect.any(String),
          pageIndex: 0,
          locatorChar: "M",
          text: "M",
        }),
        { headers: { suppressErrorToast: "true" } },
      );
    });

    it("never calls raw fetch() (must go through apiClient)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const module = makeFakeModule("A", 3);
      installEditorDocument(module, 9002, 4242);
      post.mockResolvedValueOnce({ data: { charcodes: [65] } });

      await prewarmBackendCacheForPage(0);

      expect(post).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("swallows an HTTP/network error from apiClient.post (postCharcodes -> null, no throw)", async () => {
      const module = makeFakeModule("Z", 5);
      installEditorDocument(module, 9003, 4242);
      // A rejected probe (e.g. a 401) must not propagate: prewarm is
      // best-effort and postCharcodes' catch returns null.
      post.mockRejectedValueOnce(new Error("401"));

      await expect(prewarmBackendCacheForPage(0)).resolves.toBeUndefined();
      expect(post).toHaveBeenCalledTimes(1);
    });
  });

  describe("prewarm batching + cross-font cache key", () => {
    const ENDPOINT = "/api/v1/general/pdf-text-editor-v2/encode-charcodes";

    it("batches all of a font's page chars into ONE request (H3)", async () => {
      // Two glyphs 'A','B' both rendered by font 7. Prewarm must fire ONE
      // request carrying "AB", not one per char.
      const module = makeFakeModulePage([
        ["A", 7],
        ["B", 7],
      ]);
      installEditorDocument(module, 9100, 4242);
      post.mockResolvedValueOnce({ data: { charcodes: [65, 66] } });

      await prewarmBackendCacheForPage(0);

      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        ENDPOINT,
        expect.objectContaining({ text: "AB" }),
        { headers: { suppressErrorToast: "true" } },
      );
      // Both chars cached under font 7 in request order.
      const r = new BackendResolver();
      const res = r.resolve(7, "AB", { module, pagePtr: 9100, docPtr: 4242 });
      expect(res?.charcodes).toEqual([65, 66]);
    });

    it("fires one request per distinct font, not per char", async () => {
      const module = makeFakeModulePage([
        ["A", 7],
        ["B", 8],
      ]);
      installEditorDocument(module, 9101, 4242);
      post.mockResolvedValue({ data: { charcodes: [1] } });

      await prewarmBackendCacheForPage(0);

      expect(post).toHaveBeenCalledTimes(2);
    });

    it("respects the backend's `missing` list when mapping batched charcodes", async () => {
      const module = makeFakeModulePage([
        ["A", 7],
        ["B", 7],
        ["C", 7],
      ]);
      installEditorDocument(module, 9102, 4242);
      // Backend could encode A and C but not B: charcodes align to the
      // NON-missing chars in order.
      post.mockResolvedValueOnce({
        data: { charcodes: [65, 67], missing: ["B"] },
      });

      await prewarmBackendCacheForPage(0);

      const r = new BackendResolver();
      const ctx = { module, pagePtr: 9102, docPtr: 4242 };
      expect(r.resolve(7, "A", ctx)?.charcodes).toEqual([65]);
      expect(r.resolve(7, "C", ctx)?.charcodes).toEqual([67]);
      // 'B' was reported missing -> cached null -> reported missing, not 67.
      const b = r.resolve(7, "B", ctx);
      expect(b?.charcodes).toEqual([]);
      expect(b?.missing).toEqual(["B"]);
    });

    it("does not re-POST every keystroke when the queried font differs from the rendering font (H2)", async () => {
      // 'A' is rendered by font 7 on the page, but the run is editing under a
      // borrowed font handle 99. The first resolve misses and prefetches; the
      // sentinel it seeds under font 99 must stop every subsequent keystroke
      // from re-serializing + re-POSTing the whole PDF.
      const module = makeFakeModulePage([["A", 7]]);
      installEditorDocument(module, 9200, 4242);
      post.mockResolvedValue({ data: { charcodes: [65] } });
      const r = new BackendResolver();
      const ctx: ResolverContext = { module, pagePtr: 9200, docPtr: 4242 };

      r.resolve(99, "A", ctx); // miss under font 99 -> kicks prefetch
      await waitUntil(() => post.mock.calls.length >= 1);
      const callsAfterFirst = post.mock.calls.length;

      // More keystrokes for the same (font 99, 'A'): the null sentinel must
      // short-circuit resolve() so no further prefetch fires.
      r.resolve(99, "A", ctx);
      r.resolve(99, "A", ctx);
      await new Promise((res) => setTimeout(res, 5));
      expect(post.mock.calls.length).toBe(callsAfterFirst);

      // The real charcode landed under the rendering font 7.
      expect(r.resolve(7, "A", ctx)?.charcodes).toEqual([65]);
    });
  });

  describe("cache semantics", () => {
    it("resolve() with an empty text returns null", () => {
      const r = new BackendResolver();
      expect(r.resolve(1, "", fakeCtx)).toBeNull();
    });

    it("resolve() with a 0 font returns null", () => {
      const r = new BackendResolver();
      expect(r.resolve(0, "M", fakeCtx)).toBeNull();
    });
  });

  describe("whitespace is never charcode-reused (mushroom „ bug)", () => {
    it("resolve() reports a space as missing and never round-trips it", async () => {
      const r = new BackendResolver();
      const result = r.resolve(99, " ", fakeCtx);
      // Space must be reported missing (-> emitted as a positional gap),
      // NOT looked up / cached / sent to the backend (which would paint a
      // garbage glyph like „ for charcode 0x20 in subset fonts).
      expect(result?.missing).toEqual([" "]);
      expect(result?.charcodes).toEqual([]);
      await Promise.resolve();
      await Promise.resolve();
      expect(post).not.toHaveBeenCalled();
    });

    it("resolve() splits a mixed chunk: real chars miss the cache, whitespace stays a gap", async () => {
      const r = new BackendResolver();
      // "a b" - 'a' and 'b' are genuine cache misses (kick a prefetch), the
      // space is reported missing WITHOUT being counted as a prefetch miss.
      const result = r.resolve(99, "a b", fakeCtx);
      expect(result?.missing).toEqual(["a", " ", "b"]);
      expect(result?.charcodes).toEqual([]);
      // The prefetch (for 'a') bails before HTTP in this no-window-doc env,
      // but crucially the space alone must never be the reason it fires.
      const spaceOnly = r.resolve(99, "\t\n ", fakeCtx);
      expect(spaceOnly?.charcodes).toEqual([]);
      expect(spaceOnly?.missing).toEqual(["\t", "\n", " "]);
    });
  });
});
