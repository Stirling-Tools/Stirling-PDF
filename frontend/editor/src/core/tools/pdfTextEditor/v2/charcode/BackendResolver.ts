import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";
import { getActiveCharcodeStrategy } from "@app/tools/pdfTextEditor/v2/charcode/CharcodeStrategy";

/**
 * Strategy 3: ask the Spring backend (PDFBox) to encode chars.
 *
 * The resolver itself is SYNCHRONOUS (called inside the PDFium emit
 * path which can't await), but it works via a pre-fetched cache:
 *
 *   1. `prefetchBackendEncoding(...)` is called BEFORE the user
 *      starts typing (e.g. when they focus a text run). It POSTs the
 *      source PDF + a locator pointing at an existing rendering of
 *      each surviving char + the candidate alphabet (a-z A-Z 0-9 +
 *      punctuation, or a user-supplied set) to the Spring endpoint
 *      and stores the returned charcode arrays per (fontId, char).
 *
 *   2. When `resolve()` later runs synchronously inside the emit
 *      path, it just looks up each char in the cache.
 *
 * The endpoint lives at
 * `POST /api/v1/general/pdf-text-editor-v2/encode-charcodes` and
 * returns `{ charcodes: number[], missing: string[], note, error }`.
 * See `PdfTextEditorV2CharcodeController.java`.
 */

interface PrefetchKey {
  fontPtr: number;
  pageIdx: number;
  locatorChar: string;
  locatorX: number;
  locatorY: number;
}

interface PrefetchEntry {
  pdfBase64: string;
  key: PrefetchKey;
}

/** Cache: per (fontPtr, char) → charcode integer (or null = missing). */
const charCache = new Map<string, number | null>();

/** Track in-flight prefetches so we don't double-fire. */
const inFlight = new Set<string>();

/** Endpoint config - resolved relative to current origin in dev. */
const ENDPOINT = "/api/v1/general/pdf-text-editor-v2/encode-charcodes";

/**
 * Pre-fetch charcodes for `text` under the given font locator. Safe
 * to call repeatedly: each (font, char) pair is fetched at most once
 * per session.
 */
export async function prefetchBackendEncoding(
  entry: PrefetchEntry,
  text: string,
): Promise<void> {
  const uniq = Array.from(new Set([...text]));
  const needed = uniq.filter(
    (ch) => !charCache.has(cacheKey(entry.key.fontPtr, ch)),
  );
  if (needed.length === 0) return;
  const reqKey = `${entry.key.fontPtr}:${needed.join("")}`;
  if (inFlight.has(reqKey)) return;
  inFlight.add(reqKey);
  try {
    const body = {
      pdfBase64: entry.pdfBase64,
      pageIndex: entry.key.pageIdx,
      locatorChar: entry.key.locatorChar,
      locatorX: entry.key.locatorX,
      locatorY: entry.key.locatorY,
      text: needed.join(""),
    };
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      if (typeof console !== "undefined") {
        console.warn(
          "[v2.charcode] backend prefetch HTTP error",
          resp.status,
          await resp.text().catch(() => ""),
        );
      }
      for (const ch of needed)
        charCache.set(cacheKey(entry.key.fontPtr, ch), null);
      return;
    }
    const json: {
      charcodes?: number[];
      missing?: string[];
      note?: string;
      error?: string;
    } = await resp.json();
    if (json.error) {
      if (typeof console !== "undefined") {
        console.warn(
          "[v2.charcode] backend prefetch reported error",
          json.error,
        );
      }
      for (const ch of needed)
        charCache.set(cacheKey(entry.key.fontPtr, ch), null);
      return;
    }
    const codes = json.charcodes ?? [];
    const missing = new Set(json.missing ?? []);
    // The server returns one charcode per CODE POINT of the request
    // text in order. We requested `needed.join("")` so the indices
    // line up.
    let codeIdx = 0;
    for (const ch of needed) {
      if (missing.has(ch)) {
        charCache.set(cacheKey(entry.key.fontPtr, ch), null);
        continue;
      }
      const code = codes[codeIdx++];
      charCache.set(
        cacheKey(entry.key.fontPtr, ch),
        typeof code === "number" ? code : null,
      );
    }
    if (typeof console !== "undefined") {
      console.debug(
        "[v2.charcode] backend prefetched font=" +
          entry.key.fontPtr +
          " chars=" +
          JSON.stringify(needed.join("")) +
          " codes=" +
          JSON.stringify(codes) +
          " missing=" +
          JSON.stringify([...missing]) +
          " note=" +
          (json.note ?? ""),
      );
    }
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[v2.charcode] backend prefetch fetch threw", e);
    }
    for (const ch of needed)
      charCache.set(cacheKey(entry.key.fontPtr, ch), null);
  } finally {
    inFlight.delete(reqKey);
  }
}

export class BackendResolver implements CharcodeResolver {
  readonly name = "backend" as const;

  resolve(
    font: number,
    text: string,
    ctx: ResolverContext,
  ): CharcodeResolveResult | null {
    if (!font || !text) return null;
    const charcodes: number[] = [];
    const missing: string[] = [];
    const cacheMisses: string[] = [];
    for (const ch of text) {
      const key = cacheKey(font, ch);
      if (!charCache.has(key)) {
        cacheMisses.push(ch);
        missing.push(ch);
        continue;
      }
      const code = charCache.get(key);
      if (code === null) {
        missing.push(ch);
        continue;
      }
      if (typeof code === "number") charcodes.push(code);
    }
    // Auto-kick a background prefetch for the cache-miss chars so the
    // next time the user types them (or any chunk containing them)
    // we have charcodes to use. This is a fire-and-forget side
    // effect - resolve() still returns synchronously for THIS call.
    if (cacheMisses.length > 0) {
      maybeAutoPrefetch(font, cacheMisses, ctx);
    }
    return {
      charcodes,
      coverage: charcodes.length,
      missing,
      note:
        cacheMisses.length > 0
          ? `backend cache miss for ${JSON.stringify(cacheMisses.join(""))} - prefetch kicked off in background, retry the keystroke in a moment`
          : `backend cache served ${charcodes.length} of ${text.length} char(s)`,
    };
  }
}

/**
 * Fire-and-forget prefetch triggered from inside `resolve()` when
 * the cache doesn't yet have the chars the user just typed. The
 * locator is derived from the current page + the font handle:
 *
 *   - We scan the page for the first existing text object that uses
 *     this font, read its first char's Unicode + x/y via PDFium.
 *   - We extract the full PDF bytes via `PdfiumSave.serialize` of
 *     the document.
 *   - We POST those plus the missing chars to the encode endpoint.
 *
 * The first time the user types into a new font this is a real
 * round-trip (Spring start + PDFBox parse + encode). Subsequent
 * keystrokes hit the cache.
 */
function maybeAutoPrefetch(
  fontPtr: number,
  chars: string[],
  ctx: ResolverContext,
): void {
  // Avoid re-firing while a prefetch for these chars is in flight.
  const reqKey = `auto:${fontPtr}:${chars.join("")}`;
  if (inFlight.has(reqKey)) return;
  inFlight.add(reqKey);
  void (async () => {
    try {
      const { PdfiumSave } =
        await import("@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave");
      const doc = getEditorDocument();
      if (!doc) {
        if (typeof console !== "undefined") {
          console.warn(
            "[v2.charcode] backend auto-prefetch: editor document unavailable",
          );
        }
        for (const ch of chars) charCache.set(cacheKey(fontPtr, ch), null);
        return;
      }
      const bytes = PdfiumSave.serialize(doc);
      if (!bytes || bytes.byteLength === 0) {
        for (const ch of chars) charCache.set(cacheKey(fontPtr, ch), null);
        return;
      }
      const pdfBase64 = uint8ToBase64(bytes);
      const pageIdx = pageIdxOfPagePtr(ctx);

      // Per-char prefetch: for each missing char, ask the backend for
      // a font whose ToUnicode CMap maps SOME charcode to THIS char.
      // The backend's findFontByToUnicode (Java side) scans every font
      // on the page and returns the first match - so for a per-glyph
      // Type3 PDF like Sample.pdf this picks the right font per char.
      //
      // Earlier design used a single locator + text query, which only
      // worked when one font covered every char. Type3-per-glyph PDFs
      // (Chrome/Skia output) split chars across many fonts, so per-char
      // queries are essential.
      //
      // The resolved charcode is cached under BOTH:
      //   - (borrowedFont, ch): so the legacy single-text emit path
      //     (writeViaCharcodesOrSetText) still finds it. This produces
      //     wrong visuals for cross-font glyphs but at least keeps the
      //     value reachable.
      //   - (perCharFont, ch) where perCharFont is the PDFium font
      //     handle that already renders this char on the page (probed
      //     via findFontForChar). This is what the per-char emit
      //     branch in editTextHelpers looks up after probing per-char
      //     font - giving Sample.pdf a visually-matching M.
      await Promise.all(
        chars.map(async (ch) => {
          try {
            const resp = await fetch(ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pdfBase64,
                pageIndex: pageIdx >= 0 ? pageIdx : 0,
                locatorChar: ch,
                locatorX: 1,
                locatorY: 1,
                text: ch,
              }),
            });
            if (!resp.ok) {
              charCache.set(cacheKey(fontPtr, ch), null);
              return;
            }
            const json: {
              charcodes?: number[];
              missing?: string[];
              error?: string;
            } = await resp.json();
            if (json.error || !json.charcodes || json.charcodes.length === 0) {
              charCache.set(cacheKey(fontPtr, ch), null);
              return;
            }
            const code = json.charcodes[0];
            charCache.set(cacheKey(fontPtr, ch), code);
            // Also cache under the per-char font handle so the
            // per-char emit branch in editTextHelpers can find it.
            const perCharFont = findFontForChar(ch, ctx);
            if (perCharFont && perCharFont !== fontPtr) {
              charCache.set(cacheKey(perCharFont, ch), code);
            }
            if (typeof console !== "undefined") {
              console.debug(
                `[v2.charcode] backend per-char prefetched ${JSON.stringify(ch)} -> ${code} (borrowed=${fontPtr}, perChar=${perCharFont ?? "n/a"})`,
              );
            }
          } catch {
            charCache.set(cacheKey(fontPtr, ch), null);
          }
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof console !== "undefined") {
        console.warn("[v2.charcode] backend prefetch threw:", err);
      }
      // Poison the cache so we don't retry the same chars in a tight
      // loop; the HUD event below surfaces the real reason.
      for (const ch of chars) charCache.set(cacheKey(fontPtr, ch), null);
      // Lazy-import charcodeRegistry to avoid the cyclic
      // BackendResolver ↔ charcodeRegistry module init.
      try {
        const { emitCharcodeEvent } =
          await import("@app/tools/pdfTextEditor/v2/charcode/charcodeRegistry");
        emitCharcodeEvent({
          strategy: getActiveCharcodeStrategy(),
          text: chars.join(""),
          fontPtr,
          resolved: [],
          missing: [...chars],
          note: `backend prefetch threw: ${msg}`,
          outcome: "partial-coverage-fallback",
        });
      } catch {
        /* registry import itself failed - already logged above */
      }
    } finally {
      inFlight.delete(reqKey);
    }
  })();
}

interface TextPageModule {
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (textPage: number) => void;
  FPDFText_CountChars?: (textPage: number) => number;
  FPDFText_GetUnicode?: (textPage: number, idx: number) => number;
  FPDFText_GetTextObject?: (textPage: number, idx: number) => number;
  FPDFText_GetCharOrigin?: (
    textPage: number,
    idx: number,
    xPtr: number,
    yPtr: number,
  ) => boolean;
}

interface FontReadModule {
  FPDFTextObj_GetFont?: (obj: number) => number;
}

/**
 * Find an existing char on the current page whose text object uses the
 * given font, returning its Unicode + position so we can pass it as a
 * locator to the backend. Returns null if no such char exists (the
 * font isn't used on this page).
 */
/**
 * Walk the page's text and return the FIRST PDFium font handle whose existing text object
 * renders `wantChar`. Used by the emit path when the backend strategy is active: we need
 * the font handle that owns the glyph the user is typing, not the borrowed font handle
 * from the partial-edit (which may be a different font for per-glyph-per-font PDFs).
 *
 * Caches per (pagePtr, char) so the text-page walk happens once per char per page.
 */
const fontForCharCache = new Map<string, number | null>();

export function findFontForChar(
  unicodeChar: string,
  ctx: ResolverContext,
): number | null {
  if (!unicodeChar) return null;
  const cp = unicodeChar.codePointAt(0);
  if (cp === undefined) return null;
  const cacheK = `${ctx.pagePtr}:${cp}`;
  if (fontForCharCache.has(cacheK)) return fontForCharCache.get(cacheK) ?? null;
  const m = ctx.module;
  const tpMod = m as unknown as TextPageModule;
  const fontMod = m as unknown as FontReadModule;
  if (
    !tpMod.FPDFText_LoadPage ||
    !tpMod.FPDFText_CountChars ||
    !tpMod.FPDFText_GetUnicode ||
    !tpMod.FPDFText_GetTextObject ||
    !fontMod.FPDFTextObj_GetFont
  ) {
    fontForCharCache.set(cacheK, null);
    return null;
  }
  const textPage = tpMod.FPDFText_LoadPage(ctx.pagePtr);
  if (!textPage) {
    fontForCharCache.set(cacheK, null);
    return null;
  }
  try {
    const count = tpMod.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const u = tpMod.FPDFText_GetUnicode(textPage, i);
      if (u !== cp) continue;
      const obj = tpMod.FPDFText_GetTextObject(textPage, i);
      if (!obj) continue;
      try {
        const f = fontMod.FPDFTextObj_GetFont(obj);
        if (f) {
          fontForCharCache.set(cacheK, f);
          return f;
        }
      } catch {
        continue;
      }
    }
  } finally {
    if (tpMod.FPDFText_ClosePage) {
      try {
        tpMod.FPDFText_ClosePage(textPage);
      } catch {
        /* best-effort */
      }
    }
  }
  fontForCharCache.set(cacheK, null);
  return null;
}

/** Test-only: clear the per-char-font cache. */
export function _clearFontForCharCacheForTests(): void {
  fontForCharCache.clear();
}

/**
 * Per-page idempotency guard for `prewarmBackendCacheForPage`. Tracks
 * which page pointers have already fired (or are firing) a prewarm so
 * the same page never round-trips twice in a session.
 */
const prewarmedPages = new Set<number>();

/**
 * Pre-warm the backend cache for every Unicode char that already lives on
 * the given page. Called from `TextRunOverlay`'s focus handler so the
 * user's FIRST keystroke hits a populated cache, not the
 * "miss → prefetch → retry the keystroke" 2-attempt UX.
 *
 * Implementation:
 *   1. Walk the PDFium text page to collect (unicode, perCharFont) for
 *      every char on the page.
 *   2. For each unique char that's not already cached under its
 *      perCharFont, fire one encode-charcodes request and cache the
 *      result.
 *
 * Idempotent per page-pointer. Safe to call from many overlay focus
 * handlers - only the first call does work.
 */
export async function prewarmBackendCacheForPage(
  pageIndex: number,
): Promise<void> {
  // Always log entry so tests + debug have a single signal that
  // "prewarm was at least invoked for page N" regardless of which
  // early-return path the body takes. The trailing log (after the
  // fetch fan-out) is the "prewarm COMPLETED" signal that tests
  // wait on - this is the "prewarm STARTED" counterpart.
  if (typeof console !== "undefined") {
    console.log(`[v2.charcode] backend prewarm-start pageIdx=${pageIndex}`);
  }
  const editorCtx = getEditorContextForPage(pageIndex);
  if (!editorCtx) {
    if (typeof console !== "undefined") {
      console.log(
        `[v2.charcode] backend prewarm pageIdx=${pageIndex} probes=0 (no-editor-ctx)`,
      );
    }
    return;
  }
  const { module: m, pagePtr, docPtr } = editorCtx;
  if (prewarmedPages.has(pagePtr)) {
    if (typeof console !== "undefined") {
      console.log(
        `[v2.charcode] backend prewarm pageIdx=${pageIndex} probes=0 (already-prewarmed)`,
      );
    }
    return;
  }
  prewarmedPages.add(pagePtr);

  const ctx: ResolverContext = { module: m, pagePtr, docPtr };

  // Walk the page text once, collecting (perCharFont, unicode) for every
  // glyph. Dedupe so each (font, char) probe fires at most once per page.
  const tpMod = m as unknown as TextPageModule;
  const fontMod = m as unknown as FontReadModule;
  if (
    !tpMod.FPDFText_LoadPage ||
    !tpMod.FPDFText_CountChars ||
    !tpMod.FPDFText_GetUnicode ||
    !tpMod.FPDFText_GetTextObject ||
    !fontMod.FPDFTextObj_GetFont
  )
    return;

  const probes: Array<{ ch: string; perCharFont: number }> = [];
  const seen = new Set<string>();
  const textPage = tpMod.FPDFText_LoadPage(pagePtr);
  if (!textPage) return;
  try {
    const count = tpMod.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const cp = tpMod.FPDFText_GetUnicode(textPage, i);
      if (!cp) continue;
      const ch = String.fromCodePoint(cp);
      const obj = tpMod.FPDFText_GetTextObject(textPage, i);
      if (!obj) continue;
      let f = 0;
      try {
        f = fontMod.FPDFTextObj_GetFont(obj);
      } catch {
        continue;
      }
      if (!f) continue;
      const key = `${f}:${ch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Skip whitespace - those aren't worth round-tripping and
      // editTextHelpers' per-char branch bails on whitespace anyway.
      if (/\s/.test(ch)) continue;
      // Skip if already cached under this perChar font.
      if (charCache.has(cacheKey(f, ch))) continue;
      probes.push({ ch, perCharFont: f });
      // Seed findFontForChar's cache so the emit-path probe doesn't
      // re-walk the text page for the same char.
      fontForCharCache.set(`${pagePtr}:${cp}`, f);
    }
  } finally {
    if (tpMod.FPDFText_ClosePage) {
      try {
        tpMod.FPDFText_ClosePage(textPage);
      } catch {
        /* best-effort */
      }
    }
  }
  if (probes.length === 0) return;

  try {
    const { PdfiumSave } =
      await import("@app/tools/pdfTextEditor/v2/pdfium/PdfiumSave");
    const doc = getEditorDocument();
    if (!doc) return;
    const bytes = PdfiumSave.serialize(doc);
    if (!bytes || bytes.byteLength === 0) return;
    const pdfBase64 = uint8ToBase64(bytes);

    // Cap concurrent encode-charcodes requests to avoid overwhelming
    // the Spring backend's PDFBox parser (50+ parallel POSTs can
    // saturate the thread pool and cause some chars to silently
    // time out, leaving them un-cached).
    const CONCURRENCY = 6;
    let probeIdx = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (true) {
            const me = probeIdx++;
            if (me >= probes.length) return;
            const { ch, perCharFont } = probes[me];
            const reqKey = `prewarm:${perCharFont}:${ch}`;
            if (inFlight.has(reqKey)) continue;
            inFlight.add(reqKey);
            try {
              const resp = await fetch(ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pdfBase64,
                  pageIndex,
                  locatorChar: ch,
                  locatorX: 1,
                  locatorY: 1,
                  text: ch,
                }),
              });
              if (!resp.ok) {
                if (typeof console !== "undefined") {
                  console.log(
                    `[v2.charcode] prewarm http ${resp.status} for ${JSON.stringify(ch)}`,
                  );
                }
                continue;
              }
              const json: {
                charcodes?: number[];
                missing?: string[];
                error?: string;
              } = await resp.json();
              if (json.error || !json.charcodes?.length) {
                if (typeof console !== "undefined") {
                  console.log(
                    `[v2.charcode] prewarm no-charcode for ${JSON.stringify(ch)}: error=${json.error ?? ""} charcodes=${JSON.stringify(json.charcodes)} missing=${JSON.stringify(json.missing)}`,
                  );
                }
                continue;
              }
              const code = json.charcodes[0];
              charCache.set(cacheKey(perCharFont, ch), code);
            } catch (e) {
              if (typeof console !== "undefined") {
                const msg = e instanceof Error ? e.message : String(e);
                console.log(
                  `[v2.charcode] prewarm threw for ${JSON.stringify(ch)}: ${msg}`,
                );
              }
            } finally {
              inFlight.delete(reqKey);
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
    // Expose cache state for tests so a failing assertion can dump
    // exactly what got cached vs. what was missed. Window-only side
    // effect; harmless in production.
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        __v2_charcode_cache_dump?: () => Record<string, number | null>;
      };
      w.__v2_charcode_cache_dump = () => {
        const out: Record<string, number | null> = {};
        for (const [k, v] of charCache.entries()) out[k] = v;
        return out;
      };
    }
    if (typeof console !== "undefined") {
      console.log(
        `[v2.charcode] backend prewarm pageIdx=${pageIndex} probes=${probes.length}`,
      );
    }
  } catch {
    /* prewarm is best-effort - errors are silently swallowed */
  }
  // Mark ctx as referenced so eslint doesn't flag unused.
  void ctx;
}

/** Test-only: clear the per-page prewarm guard. */
export function _clearPrewarmGuardForTests(): void {
  prewarmedPages.clear();
}

function getEditorContextForPage(pageIndex: number): {
  module: import("@embedpdf/pdfium").WrappedPdfiumModule;
  pagePtr: number;
  docPtr: number;
} | null {
  const doc = getEditorDocument();
  if (!doc) return null;
  const pages = doc.loadedPages?.();
  if (!pages) return null;
  for (const p of pages) {
    if (p.index === pageIndex) {
      return { module: doc.module, pagePtr: p.pagePtr, docPtr: doc.docPtr };
    }
  }
  return null;
}

function _locateExistingCharForFont(
  fontPtr: number,
  ctx: ResolverContext,
): { pageIdx: number; char: string; x: number; y: number } | null {
  const m = ctx.module;
  const tpMod = m as unknown as TextPageModule;
  const fontMod = m as unknown as FontReadModule;
  if (
    !tpMod.FPDFText_LoadPage ||
    !tpMod.FPDFText_CountChars ||
    !tpMod.FPDFText_GetUnicode ||
    !tpMod.FPDFText_GetTextObject ||
    !tpMod.FPDFText_GetCharOrigin ||
    !fontMod.FPDFTextObj_GetFont
  )
    return null;
  const textPage = tpMod.FPDFText_LoadPage(ctx.pagePtr);
  if (!textPage) return null;
  try {
    const count = tpMod.FPDFText_CountChars(textPage);
    const xp = m.pdfium.wasmExports.malloc(8);
    const yp = m.pdfium.wasmExports.malloc(8);
    try {
      for (let i = 0; i < count; i++) {
        const unicode = tpMod.FPDFText_GetUnicode(textPage, i);
        if (!unicode) continue;
        const obj = tpMod.FPDFText_GetTextObject(textPage, i);
        if (!obj) continue;
        let f = 0;
        try {
          f = fontMod.FPDFTextObj_GetFont(obj);
        } catch {
          continue;
        }
        if (f !== fontPtr) continue;
        if (!tpMod.FPDFText_GetCharOrigin(textPage, i, xp, yp)) continue;
        const x = m.pdfium.getValue(xp, "double");
        const y = m.pdfium.getValue(yp, "double");
        const pageIdx = pageIdxOfPagePtr(ctx);
        if (pageIdx < 0) return null;
        return { pageIdx, char: String.fromCharCode(unicode), x, y };
      }
    } finally {
      m.pdfium.wasmExports.free(xp);
      m.pdfium.wasmExports.free(yp);
    }
  } finally {
    if (tpMod.FPDFText_ClosePage)
      try {
        tpMod.FPDFText_ClosePage(textPage);
      } catch {
        /* best-effort */
      }
  }
  return null;
}

function pageIdxOfPagePtr(ctx: ResolverContext): number {
  // The ResolverContext only carries pagePtr; map back to index by
  // asking the doc model. We piggyback on the window-attached editor
  // store the tests already use. EditorStore.doc is TS-private, so
  // we read through the public `document` getter; Page exposes
  // `.index`, not `.pageIndex`.
  const w = window as unknown as {
    __v2_editor_store?: {
      document?: {
        loadedPages?: () => Iterable<{ pagePtr: number; index: number }>;
      } | null;
    };
  };
  const pages = w.__v2_editor_store?.document?.loadedPages?.();
  if (!pages) return -1;
  for (const p of pages) if (p.pagePtr === ctx.pagePtr) return p.index;
  return -1;
}

function getEditorDocument():
  | import("@app/tools/pdfTextEditor/v2/model/EditorDocument").EditorDocument
  | null {
  // EditorStore.doc is TypeScript-private; the public surface is the
  // `document` getter. Always read through that.
  const w = window as unknown as {
    __v2_editor_store?: {
      document?:
        | import("@app/tools/pdfTextEditor/v2/model/EditorDocument").EditorDocument
        | null;
    };
  };
  return w.__v2_editor_store?.document ?? null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(bin);
}

function cacheKey(fontPtr: number, ch: string): string {
  return `${fontPtr}:${ch}`;
}

/** Test-only: clear the per-char cache. */
export function _clearBackendCacheForTests(): void {
  charCache.clear();
  inFlight.clear();
}
