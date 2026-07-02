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
