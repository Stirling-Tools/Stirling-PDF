import apiClient from "@app/services/apiClient";
import type {
  CharcodeResolver,
  CharcodeResolveResult,
  ResolverContext,
} from "@app/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { getActiveCharcodeStrategy } from "@app/tools/pdfTextEditor/charcode/CharcodeStrategy";
import { getCachedFontProgramSha256 } from "@app/tools/pdfTextEditor/charcode/CmapResolver";

/** Strategy 3: ask the Spring backend (PDFBox) to encode chars. */

/** Cache: per (fontPtr, char) → charcode integer (or null = missing). */
const charCache = new Map<string, number | null>();

// Expiry timestamps for TRANSIENT-failure nulls (network error, backend down,
// serialize hiccup).
const negativeUntil = new Map<string, number>();
const NEGATIVE_TTL_MS = 30_000;

function setTransientNull(key: string): void {
  charCache.set(key, null);
  negativeUntil.set(key, Date.now() + NEGATIVE_TTL_MS);
}

/** Track in-flight prefetches so we don't double-fire. */
const inFlight = new Set<string>();

/** Hard cap on CONCURRENT auto-prefetches. */
const MAX_CONCURRENT_AUTO_PREFETCH = 2;
// Font batches in flight within a single prefetch. Matches the cap
// prewarmPageCharcodes uses so both paths load the backend the same way.
const PREFETCH_BATCH_CONCURRENCY = 6;
let autoPrefetchActive = 0;

/** Short-lived cache of the serialized document, shared by prefetch bursts. */
let serializedCache: { bytes: Uint8Array; at: number } | null = null;
const SERIALIZE_TTL_MS = 4000;

function serializeDocCached<D>(
  save: { serialize: (d: D) => Uint8Array },
  doc: D,
): Uint8Array | null {
  const now = Date.now();
  if (serializedCache && now - serializedCache.at < SERIALIZE_TTL_MS) {
    return serializedCache.bytes;
  }
  const bytes = save.serialize(doc);
  if (!bytes || bytes.byteLength === 0) return null;
  serializedCache = { bytes, at: now };
  return bytes;
}

/** Endpoint config - resolved relative to current origin in dev. */
const ENDPOINT = "/api/v1/general/pdf-text-editor/encode-charcodes";

/** Shape of the encode-charcodes JSON response (mirrors the controller). */
interface EncodeCharcodesResponse {
  charcodes?: number[];
  missing?: string[];
  note?: string;
  error?: string;
}

// POST JSON to the charcode endpoint via the shared `apiClient`. `apiClient` is
// the canonical Stirling HTTP helper.
async function postCharcodes(
  body: Record<string, unknown>,
): Promise<EncodeCharcodesResponse | null> {
  try {
    const resp = await apiClient.post<EncodeCharcodesResponse>(ENDPOINT, body, {
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    return resp.data ?? null;
  } catch {
    return null;
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
      // Whitespace is never charcode-reused (no real space glyph in subset
      // fonts; SetCharcodes(0x20) paints garbage like „).
      if (/\s/.test(ch)) {
        missing.push(ch);
        continue;
      }
      const key = cacheKey(font, ch);
      if (!charCache.has(key)) {
        cacheMisses.push(ch);
        missing.push(ch);
        continue;
      }
      const code = charCache.get(key);
      if (code === null) {
        // A transient-failure null past its TTL becomes a cache miss so
        // the prefetch below retries it.
        const until = negativeUntil.get(key);
        if (until !== undefined && Date.now() >= until) {
          charCache.delete(key);
          negativeUntil.delete(key);
          cacheMisses.push(ch);
        }
        missing.push(ch);
        continue;
      }
      if (typeof code === "number") charcodes.push(code);
    }
    // Auto-kick a background prefetch for the cache-miss chars so the next time
    // the user types them we have charcodes to use.
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

// Fire-and-forget prefetch triggered from inside `resolve()` when the cache
// doesn't yet have the chars the user just typed.
function maybeAutoPrefetch(
  fontPtr: number,
  chars: string[],
  ctx: ResolverContext,
): void {
  // Never round-trip whitespace - it has no reusable glyph (see resolve()).
  // Dedupe too: resolve() pushes one entry per occurrence, so a repeated
  // character would otherwise cost one request per repeat.
  chars = [...new Set(chars.filter((ch) => !/\s/.test(ch)))];
  if (chars.length === 0) return;
  // Concurrency cap: dropping is safe - the chars stay cache-miss and a
  // later keystroke re-fires once a slot frees up.
  if (autoPrefetchActive >= MAX_CONCURRENT_AUTO_PREFETCH) return;
  // Avoid re-firing while a prefetch for these chars is in flight.
  const reqKey = `auto:${fontPtr}:${chars.join("")}`;
  if (inFlight.has(reqKey)) return;
  inFlight.add(reqKey);
  autoPrefetchActive += 1;
  void (async () => {
    try {
      const { PdfiumSave } =
        await import("@app/tools/pdfTextEditor/pdfium/PdfiumSave");
      const doc = getEditorDocument();
      if (!doc) {
        if (typeof console !== "undefined") {
          console.warn(
            "[charcode] backend auto-prefetch: editor document unavailable",
          );
        }
        for (const ch of chars) setTransientNull(cacheKey(fontPtr, ch));
        return;
      }
      const bytes = serializeDocCached(PdfiumSave, doc);
      if (!bytes) {
        for (const ch of chars) setTransientNull(cacheKey(fontPtr, ch));
        return;
      }
      const pdfBase64 = uint8ToBase64(bytes);
      const pageIdx = pageIdxOfPagePtr(ctx);

      // Batch by font: one request per font carrying all of that font's
      // missing chars, mirroring prewarmPageCharcodes. Previously this fired
      // one request per character, each re-sending the entire base64 PDF.
      const byFont = new Map<number, string[]>();
      for (const ch of chars) {
        const perCharFont = findFontForChar(ch, ctx) || fontPtr;
        const arr = byFont.get(perCharFont);
        if (arr) arr.push(ch);
        else byFont.set(perCharFont, [ch]);
      }

      const batches = [...byFont.entries()];
      let batchIdx = 0;
      const workers: Promise<void>[] = [];
      for (
        let w = 0;
        w < Math.min(PREFETCH_BATCH_CONCURRENCY, batches.length);
        w++
      ) {
        workers.push(
          (async () => {
            while (true) {
              const me = batchIdx++;
              if (me >= batches.length) return;
              const [perCharFont, fontChars] = batches[me];
              const json = await postCharcodes({
                pdfBase64,
                pageIndex: pageIdx >= 0 ? pageIdx : 0,
                // Any of this font's chars is a valid locator.
                locatorChar: fontChars[0],
                fontName: readFontName(ctx.module, perCharFont),
                // Program-bytes hash: the only identity that survives PDFium's
                // subset-tag stripping.
                fontSha256:
                  getCachedFontProgramSha256(perCharFont) ?? undefined,
                text: fontChars.join(""),
              });

              if (!json || json.error) {
                // Network failure / backend error: retry after the TTL. Only a
                // real "encoded 0 of N" answer is a permanent miss.
                for (const ch of fontChars) {
                  setTransientNull(cacheKey(perCharFont, ch));
                }
              } else {
                // The backend appends one charcode per NON-missing char, in
                // request order.
                const missing = new Set(json.missing ?? []);
                const codes = json.charcodes ?? [];
                let k = 0;
                for (const ch of fontChars) {
                  if (missing.has(ch)) {
                    charCache.set(cacheKey(perCharFont, ch), null);
                    continue;
                  }
                  const code = codes[k++];
                  charCache.set(
                    cacheKey(perCharFont, ch),
                    typeof code === "number" ? code : null,
                  );
                }
              }

              // Stop the per-keystroke prefetch storm. resolve looks these
              // chars up under the QUERIED font, not perCharFont. Use the
              // TTL'd null: this font was never actually asked, so a permanent
              // null would kill the pair for the rest of the session.
              if (perCharFont !== fontPtr) {
                for (const ch of fontChars) {
                  setTransientNull(cacheKey(fontPtr, ch));
                }
              }
            }
          })(),
        );
      }
      await Promise.all(workers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (typeof console !== "undefined") {
        console.warn("[charcode] backend prefetch threw:", err);
      }
      // Negative-cache with TTL so we don't retry the same chars in a tight
      // loop but DO recover once the backend is reachable again.
      for (const ch of chars) setTransientNull(cacheKey(fontPtr, ch));
      // Lazy-import charcodeRegistry to avoid the cyclic
      // BackendResolver ↔ charcodeRegistry module init.
      try {
        const { emitCharcodeEvent } =
          await import("@app/tools/pdfTextEditor/charcode/charcodeRegistry");
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
      autoPrefetchActive -= 1;
    }
  })();
}

interface TextPageModule {
  FPDFText_LoadPage?: (page: number) => number;
  FPDFText_ClosePage?: (textPage: number) => void;
  FPDFText_CountChars?: (textPage: number) => number;
  FPDFText_GetUnicode?: (textPage: number, idx: number) => number;
  FPDFText_GetTextObject?: (textPage: number, idx: number) => number;
}

interface FontReadModule {
  FPDFTextObj_GetFont?: (obj: number) => number;
}

// Find an existing char on the current page whose text object uses the given
// font.
const fontForCharCache = new Map<string, number | null>();

/** Bold/italic classification of a font, read from its /BaseFont name. */
export interface FontStyleClass {
  bold: boolean;
  italic: boolean;
}

/**
 * Classify a font handle as bold/italic from its /BaseFont name.
 *
 * Borrowing a glyph from a face of a different weight is what made edited body
 * text come back bold: the first "o" in document order often lives in a bold
 * heading.
 */
export function fontStyleClass(
  m: ResolverContext["module"],
  fontPtr: number,
): FontStyleClass | null {
  const name = readFontName(m, fontPtr);
  if (!name) return null;
  return styleClassFromName(name);
}

/** Same classification from a font FAMILY name (base-14 or device font). */
export function styleClassFromName(name: string): FontStyleClass {
  return {
    bold: /bold|black|heavy|semibold|demi/i.test(name),
    italic: /italic|oblique/i.test(name),
  };
}

const reusableFontCache = new Map<number, boolean>();

/**
 * Whether a font has a real font program behind it.
 *
 * A Type 3 face is a dictionary of content-stream procedures, so PDFium can
 * report neither a glyph advance nor a usable ink box for it. Its glyphs are
 * still drawable - callers may reuse one when they can measure its advance
 * some other way - but laying out new text on PDFium's numbers alone stacks
 * every glyph on the previous one.
 */
export function fontIsReusable(
  m: ResolverContext["module"],
  fontPtr: number,
): boolean {
  if (!fontPtr) return false;
  const cached = reusableFontCache.get(fontPtr);
  if (cached !== undefined) return cached;
  const getData = (
    m as unknown as {
      FPDFFont_GetFontData?: (
        font: number,
        buf: number,
        buflen: number,
        outLen: number,
      ) => boolean;
    }
  ).FPDFFont_GetFontData;
  // No API to ask with: assume reusable so nothing regresses.
  if (typeof getData !== "function") {
    reusableFontCache.set(fontPtr, true);
    return true;
  }
  // A Type 3 font is a dictionary of content-stream procedures, not a font
  // program. PDFium still answers "true" for it, but reports a length of 0 -
  // the length is the part that distinguishes a real face.
  let ok = false;
  const out = m.pdfium.wasmExports.malloc(4);
  try {
    m.pdfium.setValue(out, 0, "i32");
    ok = getData(fontPtr, 0, 0, out) && m.pdfium.getValue(out, "i32") > 0;
  } catch {
    ok = false;
  } finally {
    m.pdfium.wasmExports.free(out);
  }
  reusableFontCache.set(fontPtr, ok);
  return ok;
}

/** Test-only: clear the reusable-font cache. */
export function _clearReusableFontCacheForTests(): void {
  reusableFontCache.clear();
}

export function findFontForChar(
  unicodeChar: string,
  ctx: ResolverContext,
  // When given, only fonts with the SAME bold/italic class as this one are
  // accepted, so a borrowed glyph never changes the run's weight or slant.
  likeFontPtr?: number,
  // Used when there is no source font handle to read a style from - notably on
  // the undo path, which re-emits with `originalFontPtr: 0`. Without it the
  // borrow is unconstrained again and restored body text comes back bold.
  likeStyle?: FontStyleClass | null,
): number | null {
  if (!unicodeChar) return null;
  const cp = unicodeChar.codePointAt(0);
  if (cp === undefined) return null;
  const m = ctx.module;
  const want =
    (likeFontPtr ? fontStyleClass(m, likeFontPtr) : null) ?? likeStyle ?? null;
  // The style is part of the answer, so it must be part of the cache key.
  const styleK = want
    ? `${want.bold ? "b" : ""}${want.italic ? "i" : ""}|`
    : "";
  // So is the source face: the borrow prefers the run's own family, so two
  // runs of different families must not share an answer.
  const likeName = likeFontPtr
    ? baseFontFamily(readFontName(m, likeFontPtr))
    : undefined;
  const cacheK = `${ctx.pagePtr}:${styleK}${likeName ?? ""}|${cp}`;
  if (fontForCharCache.has(cacheK)) return fontForCharCache.get(cacheK) ?? null;
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
    // The run's OWN family, wherever the page happens to draw this char in it,
    // beats whichever style-compatible face comes first in content order. A
    // word the document already uses otherwise came back in a near-miss face -
    // right weight, slightly wrong shapes and advances.
    let fallback: number | null = null;
    for (let i = 0; i < count; i++) {
      const u = tpMod.FPDFText_GetUnicode(textPage, i);
      if (u !== cp) continue;
      const obj = tpMod.FPDFText_GetTextObject(textPage, i);
      if (!obj) continue;
      try {
        const f = fontMod.FPDFTextObj_GetFont(obj);
        if (!f) continue;
        if (want) {
          const got = fontStyleClass(m, f);
          // An unnamed font can't be vouched for; skip it rather than risk a
          // weight change.
          if (!got || got.bold !== want.bold || got.italic !== want.italic) {
            continue;
          }
        }
        if (!likeName || baseFontFamily(readFontName(m, f)) === likeName) {
          fontForCharCache.set(cacheK, f);
          return f;
        }
        if (fallback === null) fallback = f;
      } catch {
        continue;
      }
    }
    if (fallback !== null) {
      fontForCharCache.set(cacheK, fallback);
      return fallback;
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

interface FontNameModule {
  FPDFFont_GetBaseFontName?: (font: number, buf: number, len: number) => number;
}

/**
 * A face's family, with the subset tag and style suffix stripped:
 * "ABCDEF+LMRoman12-Regular" -> "lmroman12". Two handles that agree here are
 * the same design, so a glyph borrowed across them keeps the run's look.
 */
function baseFontFamily(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const family = name.replace(/^[A-Z]{6}\+/, "").split(/[-,]/)[0];
  return family ? family.toLowerCase() : undefined;
}

const fontNameCache = new Map<number, string | undefined>();

/** Test-only: clear the memoised /BaseFont names. */
export function _clearFontNameCacheForTests(): void {
  fontNameCache.clear();
}

// Read a font's /BaseFont name so the backend can disambiguate WHICH font to
// encode against when two fonts on the page render the same char.
function readFontName(
  m: ResolverContext["module"],
  fontPtr: number,
): string | undefined {
  if (!fontPtr) return undefined;
  if (fontNameCache.has(fontPtr)) return fontNameCache.get(fontPtr);
  const name = loadFontName(m, fontPtr);
  fontNameCache.set(fontPtr, name);
  return name;
}

function loadFontName(
  m: ResolverContext["module"],
  fontPtr: number,
): string | undefined {
  const fn = (m as unknown as FontNameModule).FPDFFont_GetBaseFontName;
  if (typeof fn !== "function") return undefined;
  try {
    const len = fn(fontPtr, 0, 0);
    if (len <= 1) return undefined;
    const buf = m.pdfium.wasmExports.malloc(len);
    try {
      fn(fontPtr, buf, len);
      return m.pdfium.UTF8ToString(buf) || undefined;
    } finally {
      m.pdfium.wasmExports.free(buf);
    }
  } catch {
    return undefined;
  }
}

/** Per-page idempotency guard for `prewarmBackendCacheForPage`. */
const prewarmedPages = new Set<number>();

// Pre-warm the backend cache for every Unicode char that already lives on the
// given page.
const TYPEABLE_CHARS: string[] = (() => {
  const out: string[] = [];
  for (let cp = 0x21; cp <= 0x7e; cp += 1) out.push(String.fromCodePoint(cp));
  return out;
})();

const MAX_PREWARM_PROBES = 4000;

function addTypeableProbes(
  probes: Array<{ ch: string; perCharFont: number }>,
  seen: Set<string>,
): void {
  const fonts = [...new Set(probes.map((p) => p.perCharFont))];
  for (const font of fonts) {
    for (const ch of TYPEABLE_CHARS) {
      if (probes.length >= MAX_PREWARM_PROBES) return;
      const key = `${font}:${ch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (charCache.has(cacheKey(font, ch))) continue;
      probes.push({ ch, perCharFont: font });
    }
  }
}

export async function prewarmBackendCacheForPage(
  pageIndex: number,
): Promise<void> {
  // Always log entry so tests + debug have a single signal that "prewarm was at
  // least invoked for page N" regardless of which early-return path the body.
  if (typeof console !== "undefined") {
    console.debug(`[charcode] backend prewarm-start pageIdx=${pageIndex}`);
  }
  const editorCtx = getEditorContextForPage(pageIndex);
  if (!editorCtx) {
    if (typeof console !== "undefined") {
      console.debug(
        `[charcode] backend prewarm pageIdx=${pageIndex} probes=0 (no-editor-ctx)`,
      );
    }
    return;
  }
  const { module: m, pagePtr } = editorCtx;
  if (prewarmedPages.has(pagePtr)) {
    if (typeof console !== "undefined") {
      console.debug(
        `[charcode] backend prewarm pageIdx=${pageIndex} probes=0 (already-prewarmed)`,
      );
    }
    return;
  }

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
  addTypeableProbes(probes, seen);
  if (probes.length === 0) return;

  // Guard the page only once we're committed to the fetch fan-out.
  prewarmedPages.add(pagePtr);

  try {
    const { PdfiumSave } =
      await import("@app/tools/pdfTextEditor/pdfium/PdfiumSave");
    const doc = getEditorDocument();
    if (!doc) return;
    const bytes = PdfiumSave.serialize(doc);
    if (!bytes || bytes.byteLength === 0) return;
    const pdfBase64 = uint8ToBase64(bytes);

    // Batch by font: fire ONE encode-charcodes request per font carrying ALL of
    // that font's page chars, instead of one request per (font, char).
    const byFont = new Map<number, string[]>();
    for (const { ch, perCharFont } of probes) {
      const arr = byFont.get(perCharFont);
      if (arr) arr.push(ch);
      else byFont.set(perCharFont, [ch]);
    }
    const fontBatches = [...byFont.entries()].map(([font, chars]) => ({
      font,
      chars,
    }));

    // Cap concurrent encode-charcodes requests to avoid overwhelming the Spring
    // backend's PDFBox parser (many parallel POSTs can saturate the thread pool).
    const CONCURRENCY = 6;
    let batchIdx = 0;
    let probesSucceeded = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (true) {
            const me = batchIdx++;
            if (me >= fontBatches.length) return;
            const { font, chars } = fontBatches[me];
            const reqKey = `prewarm:${font}:${chars.join("")}`;
            if (inFlight.has(reqKey)) continue;
            inFlight.add(reqKey);
            try {
              const json = await postCharcodes({
                pdfBase64,
                pageIndex,
                // Any of this font's chars is a valid locator (the font renders
                // them all).
                locatorChar: chars[0],
                fontName: readFontName(m, font),
                // Program-bytes hash beats the name: PDFium strips subset tags.
                fontSha256: getCachedFontProgramSha256(font) ?? undefined,
                text: chars.join(""),
              });
              if (!json || json.error) continue;
              // Map returned charcodes back to chars: the backend appends one
              // charcode per NON-missing char in request order.
              const missing = new Set(json.missing ?? []);
              const codes = json.charcodes ?? [];
              let k = 0;
              for (const ch of chars) {
                if (missing.has(ch)) {
                  charCache.set(cacheKey(font, ch), null);
                  continue;
                }
                const code = codes[k++];
                if (typeof code === "number") {
                  charCache.set(cacheKey(font, ch), code);
                  probesSucceeded += 1;
                } else {
                  charCache.set(cacheKey(font, ch), null);
                }
              }
            } finally {
              inFlight.delete(reqKey);
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
    if (typeof console !== "undefined") {
      console.debug(
        `[charcode] backend prewarm pageIdx=${pageIndex} probes=${probes.length} succeeded=${probesSucceeded}`,
      );
    }
    // If EVERY probe failed (auth, backend down, all 500s) un-mark the page so
    // a subsequent focus can retry instead of silently returning early forever.
    if (probesSucceeded === 0) {
      prewarmedPages.delete(pagePtr);
    }
  } catch {
    /* prewarm is best-effort - errors are silently swallowed */
    prewarmedPages.delete(pagePtr);
  }
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

function pageIdxOfPagePtr(ctx: ResolverContext): number {
  // The ResolverContext only carries pagePtr; map back to index by asking the
  // doc model.
  const w = window as unknown as {
    __editor_store?: {
      document?: {
        loadedPages?: () => Iterable<{ pagePtr: number; index: number }>;
      } | null;
    };
  };
  const pages = w.__editor_store?.document?.loadedPages?.();
  if (!pages) return -1;
  for (const p of pages) if (p.pagePtr === ctx.pagePtr) return p.index;
  return -1;
}

function getEditorDocument():
  | import("@app/tools/pdfTextEditor/model/EditorDocument").EditorDocument
  | null {
  // EditorStore.doc is TypeScript-private; the public surface is the
  // `document` getter. Always read through that.
  const w = window as unknown as {
    __editor_store?: {
      document?:
        | import("@app/tools/pdfTextEditor/model/EditorDocument").EditorDocument
        | null;
    };
  };
  return w.__editor_store?.document ?? null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  // Pass the typed-array subarray straight to apply() (it is array-like) so we
  // don't allocate an intermediate Array per chunk for large PDFs.
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
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
  negativeUntil.clear();
  inFlight.clear();
}

// Reset ALL module-level caches keyed by raw PDFium pointers (per-char
// charcodes, per-page prewarm guard, per-char font handles, in-flight set).
export function resetBackendResolverCaches(): void {
  charCache.clear();
  negativeUntil.clear();
  inFlight.clear();
  prewarmedPages.clear();
  fontForCharCache.clear();
  serializedCache = null;
  autoPrefetchActive = 0;
}
