package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.Operation;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Charcode-encode helper for the v2 PDF text editor.
 *
 * <p>The frontend editor uses PDFium-WASM, which exposes {@code FPDFText_SetCharcodes} for writing
 * new text using raw font charcodes (skipping PDFium's broken reverse Unicode→CID lookup for
 * embedded subset fonts). What PDFium does NOT expose is the byte-encoding side of an existing font
 * - given a PDFont and a Unicode string, what are the bytes the font's encoding produces? PDFBox
 * does have that ({@link PDFont#encode}).
 *
 * <p>This endpoint accepts the source PDF + a "locator" describing where to find the font in
 * question (page index + a sample char known to render in the target font, optionally narrowed by
 * the font's /BaseFont name) + the Unicode text the frontend wants to encode. It returns the
 * charcode sequence the frontend can pass to {@code FPDFText_SetCharcodes}.
 *
 * <p>If the locator can't find a matching text fragment, or if the font can't encode some chars,
 * the response reports which chars are missing so the frontend can fall back to Helvetica per char.
 */
@Slf4j
@GeneralApi
@RequiredArgsConstructor
public class PdfTextEditorV2CharcodeController {

    /** Reject JSON bodies whose base64 implies a decoded PDF larger than this. */
    private static final int MAX_PDF_BYTES = 100 * 1024 * 1024;

    /**
     * Upper bound on {@code request.text} code units. Editor requests are word-sized; an unbounded
     * text drove a per-code-point encode/exception loop (CPU burn) on crafted requests.
     */
    private static final int MAX_TEXT_CHARS = 4096;

    /** Nested form-XObject resource dictionaries visited per lookup (cycle/DoS guard). */
    private static final int MAX_RESOURCE_DICTS = 32;

    /** Bound on the reverse-map cache so a busy multi-document server can't grow it forever. */
    private static final int REVERSE_MAP_CACHE_MAX = 32;

    /** Access-ordered LRU bounded at {@link #REVERSE_MAP_CACHE_MAX} entries. */
    private static final class BoundedReverseMapCache
            extends java.util.LinkedHashMap<String, java.util.Map<String, Long>> {
        private static final long serialVersionUID = 1L;

        BoundedReverseMapCache() {
            super(16, 0.75f, true);
        }

        @Override
        protected boolean removeEldestEntry(
                java.util.Map.Entry<String, java.util.Map<String, Long>> eldest) {
            return size() > REVERSE_MAP_CACHE_MAX;
        }
    }

    /**
     * Reverse Unicode→charcode maps, cached by {@code pdfContentHash + "|" + fontName} so repeated
     * edits on the SAME document reuse the 0..0xFFFF {@code toUnicode} probe instead of re-running
     * it (up to 65 536 lookups per font) on every keystroke's request. Access-ordered LRU bounded
     * by {@link #REVERSE_MAP_CACHE_MAX}.
     *
     * <p>The previous {@code WeakHashMap<PDFont, ...>} never hit across requests: every request
     * loads a fresh {@link PDDocument} hence a fresh {@link PDFont} instance, so the key was never
     * equal from one request to the next - it was effectively dead code. Keying on the PDF bytes'
     * hash gives a stable cross-request key.
     */
    private static final java.util.Map<String, java.util.Map<String, Long>> REVERSE_MAP_CACHE =
            java.util.Collections.synchronizedMap(new BoundedReverseMapCache());

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    // NOTE: PDFBox's PDSimpleFont emits one "No Unicode mapping for .notdef" WARN per probed
    // charcode when buildReverseUnicodeMap iterates 0..0xFFFF, which once flooded info.log to
    // ~1.4 GB overnight. That logger is silenced DECLARATIVELY in logback.xml (a config entry ops
    // can see and revert) rather than by mutating the global logger from a static block here -
    // mutating it at class-load time hid the same warnings from every other tool in the JVM with
    // no trace in configuration.

    @Data
    public static class EncodeCharcodesRequest {

        /** Base64-encoded original PDF. The frontend already has the bytes loaded. */
        private String pdfBase64;

        /** 0-based page index containing the font sample. */
        private int pageIndex;

        /**
         * A char known to exist on the page in the target font. Combined with {@code fontName}
         * (when supplied) it locates the source PDFont via its ToUnicode CMap.
         */
        private String locatorChar;

        /**
         * Optional /BaseFont name of the target font (as PDFium's FPDFFont_GetBaseFontName reports
         * it). When a page has TWO fonts that both render {@code locatorChar}, this disambiguates
         * which one to encode against - otherwise the first font found wins and a cross-font edit
         * gets the wrong font's charcode. Null = keep the legacy first-match behaviour.
         */
        private String fontName;

        /**
         * Optional SHA-256 (lowercase hex) of the target font's embedded program bytes (what
         * PDFium's FPDFFont_GetFontData returns = the decoded FontFile/FontFile2/FontFile3 stream).
         * This is the ONLY unambiguous font identity: PDFium strips the "ABCDEF+" subset tag from
         * font names, so every subset of one family reports the same {@code fontName} and a
         * name-based lookup can land on a SIBLING subset whose charcode space is different -
         * returning valid-but-wrong charcodes that scramble the edited text. When present and a
         * font on the page matches, it wins over name matching.
         */
        private String fontSha256;

        /** Unicode text the frontend wants to encode. */
        private String text;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class EncodeCharcodesResponse {
        /**
         * Per-char charcode array (one entry per code point in {@code request.text}). When the
         * font's encoding produces multi-byte sequences, each char gets the full unsigned int value
         * of its bytes packed big-endian (so a 2-byte CID like 0x004D becomes 77).
         */
        private List<Long> charcodes;

        /** Chars from the request that the font couldn't encode. */
        private List<String> missing;

        /** Diagnostic note - included so the frontend HUD can show what happened. */
        private String note;

        /** Set when the request failed entirely (bad pdf bytes, no matching font, etc.). */
        private String error;
    }

    @Operation(
            summary = "Encode Unicode → font charcodes for the v2 PDF text editor",
            description =
                    """
                    Frontend-only helper: takes the source PDF, a locator pointing at an existing
                    char rendered in the target font, and a Unicode string. Returns the byte
                    sequence the target font produces for that Unicode, packed as one unsigned
                    int per char. The frontend then calls FPDFText_SetCharcodes with the
                    returned ints to inject new text that reuses the embedded font's actual
                    glyphs. Chars the font can't encode are listed in `missing` so the caller
                    can fall back per-char.
                    """)
    @PostMapping(
            value = "/pdf-text-editor-v2/encode-charcodes",
            consumes = "application/json",
            produces = "application/json")
    public ResponseEntity<EncodeCharcodesResponse> encodeCharcodes(
            @RequestBody EncodeCharcodesRequest request) {
        EncodeCharcodesResponse resp = new EncodeCharcodesResponse();
        if (request == null
                || request.getPdfBase64() == null
                || request.getText() == null
                || request.getLocatorChar() == null) {
            resp.setError("missing required fields");
            return ResponseEntity.badRequest().body(resp);
        }
        // length/4*3 bounds the decoded size without decoding, so we reject early before
        // allocating.
        String b64 = request.getPdfBase64();
        if ((long) b64.length() / 4 * 3 > MAX_PDF_BYTES) {
            resp.setError("pdf too large");
            return ResponseEntity.status(413).body(resp);
        }
        if (request.getText().length() > MAX_TEXT_CHARS || request.getLocatorChar().length() > 4) {
            resp.setError("text too long");
            return ResponseEntity.badRequest().body(resp);
        }
        byte[] pdfBytes;
        try {
            pdfBytes = Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            resp.setError("pdfBase64 is not valid base64");
            return ResponseEntity.badRequest().body(resp);
        }
        try (PDDocument doc = pdfDocumentFactory.load(pdfBytes, true)) {
            if (request.getPageIndex() < 0 || request.getPageIndex() >= doc.getNumberOfPages()) {
                resp.setError("pageIndex out of range");
                return ResponseEntity.badRequest().body(resp);
            }
            PDPage page = doc.getPage(request.getPageIndex());
            // Skip walking the page's content stream (it crashes on Type3 fonts with
            // UnsupportedOperationException("Not implemented: Type3") before we can do anything
            // useful). Instead enumerate the page's font resources and pick the one identified by
            // the request's font-program hash (definitive), falling back to name matching.
            // For Chrome/Skia-printed PDFs that emit one Type3 font per glyph, this lands on
            // the exact font that renders the locator char.
            PDFont font =
                    findFontByToUnicode(
                            page,
                            request.getLocatorChar(),
                            request.getFontName(),
                            request.getFontSha256(),
                            doc);
            if (font == null) {
                resp.setError(
                        "no font on page "
                                + request.getPageIndex()
                                + " renders locatorChar="
                                + request.getLocatorChar()
                                + (request.getFontName() != null
                                        ? " (fontName=" + request.getFontName() + ")"
                                        : ""));
                return ResponseEntity.ok(resp);
            }
            // Build a reverse Unicode→charcode map by walking the font's ToUnicode CMap.
            // This is the ONLY path that works for Type3 fonts (PDFBox's font.encode() throws
            // "Not implemented: Type3" on them), and it also acts as a more reliable fallback
            // for subset fonts whose encode() rejects chars not in the original document.
            //
            // For Sample.pdf specifically, every embedded font is Type3 (Chrome/Skia output),
            // but they all carry a ToUnicode CMap mapping CIDs back to Unicode. We iterate
            // charcodes 0..0xFFFF, call font.toUnicode(cc) for each, and record the inverse
            // mapping for the chars the user wants to write.
            java.util.Map<String, Long> reverseMap =
                    buildReverseUnicodeMap(
                            pdfBytes, font, request.getPageIndex(), request.getLocatorChar());
            List<Long> charcodes = new ArrayList<>();
            List<String> missing = new ArrayList<>();
            String text = request.getText();
            int i = 0;
            while (i < text.length()) {
                int cp = text.codePointAt(i);
                String oneChar = new String(Character.toChars(cp));
                i += Character.charCount(cp);
                // Whitespace is NEVER charcode-reused. Subset Type1/LaTeX fonts
                // usually have no real space glyph, yet font.encode(0x20) still
                // returns code 0x20 without throwing - and SetCharcodes(0x20)
                // then paints whatever glyph sits at that subset code (e.g. „
                // quotedblbase in LMRoman). Report whitespace as missing so the
                // frontend emits it as a positional gap instead.
                if (Character.isWhitespace(cp)) {
                    missing.add(oneChar);
                    continue;
                }
                // 1st try: font.encode() - works for Type0/TrueType/Type1
                Long packed = null;
                try {
                    byte[] encoded = font.encode(oneChar);
                    long p = 0L;
                    for (byte b : encoded) p = (p << 8) | (b & 0xff);
                    packed = p;
                } catch (IOException
                        | IllegalArgumentException
                        | UnsupportedOperationException encodeEx) {
                    // 2nd try: ToUnicode reverse lookup - works for Type3 + anything with a CMap
                    packed = reverseMap.get(oneChar);
                }
                if (packed != null) charcodes.add(packed);
                else missing.add(oneChar);
            }
            resp.setCharcodes(charcodes);
            if (!missing.isEmpty()) resp.setMissing(missing);
            resp.setNote(
                    "font="
                            + font.getName()
                            + " encoded "
                            + charcodes.size()
                            + " of "
                            + (charcodes.size() + missing.size())
                            + " chars");
            return ResponseEntity.ok(resp);
        } catch (IOException e) {
            log.warn("encodeCharcodes: failed to load PDF", e);
            resp.setError("failed to load PDF");
            return ResponseEntity.badRequest().body(resp);
        } catch (RuntimeException e) {
            log.warn("encodeCharcodes: unexpected error", e);
            resp.setError("unexpected error");
            return ResponseEntity.status(500).body(resp);
        }
    }

    /**
     * Locate the font the request targets. Identity sources, strongest first:
     *
     * <ol>
     *   <li><b>Program hash</b>: SHA-256 of the embedded font program bytes. Definitive - two
     *       different subsets NEVER share program bytes, and PDFium's FPDFFont_GetFontData returns
     *       exactly the decoded FontFile stream, so frontend and backend hash the same bytes.
     *   <li><b>Exact /BaseFont name</b> (subset tag included), then <b>tag-stripped name</b>. Name
     *       matches are only accepted when UNAMBIGUOUS: PDFium reports subset fonts WITHOUT their
     *       "ABCDEF+" tag, so a page with several subsets of one family ("AAAAAC+Garamond",
     *       "AAAAAG+Garamond", ...) has them ALL match the stripped name - and encoding against the
     *       wrong sibling returns valid-but-wrong charcodes that scramble the edited text ("RUSSELL
     *       W. MANGUM" rendered "US EEL W. MANGS M"). With 2+ candidates we return null so the
     *       frontend takes its safe fallback instead of a coin flip.
     * </ol>
     *
     * <p>This avoids running PDFStreamEngine.processPage, which throws
     * UnsupportedOperationException on Type3 font glyph rendering. The PDFont lookup itself is
     * purely metadata-driven and works on all subtypes.
     */
    private static PDFont findFontByToUnicode(
            PDPage page, String wantChar, String fontName, String fontSha256, PDDocument doc) {
        try {
            List<PDFont> fonts = collectResourceTreeFonts(page.getResources());

            // 1) Program-hash identity. When several dicts share one program (identical bytes
            // re-embedded), any of them renders the same glyphs for the same codes; prefer the
            // one whose ToUnicode covers the locator char so the reverse map is usable.
            if (fontSha256 != null && !fontSha256.isEmpty()) {
                List<PDFont> hashMatches = new ArrayList<>();
                for (PDFont f : fonts) {
                    String sha = fontProgramSha256(f);
                    if (fontSha256.equalsIgnoreCase(sha)) hashMatches.add(f);
                }
                for (PDFont f : hashMatches) {
                    if (probesToUnicode(f, wantChar)) return f;
                }
                if (!hashMatches.isEmpty()) return hashMatches.get(0);
                // No program on this page hashes to what the frontend is editing (e.g. PDFium
                // returned a substitute font's bytes for a non-embedded font). Fall through to
                // name matching rather than failing outright.
            }

            // 2) Name identity - exact tag-included first, then tag-stripped - each accepted
            // only when it selects a single font.
            if (fontName != null && !fontName.isEmpty()) {
                PDFont exact =
                        selectUnambiguous(
                                fonts, wantChar, f -> fontName.equals(f.getName()), "exact");
                if (exact != null) return exact;
                String wantStripped = stripSubsetTag(fontName);
                PDFont stripped =
                        selectUnambiguous(
                                fonts,
                                wantChar,
                                f -> wantStripped.equals(stripSubsetTag(f.getName())),
                                "stripped");
                if (stripped != null) return stripped;
                // The frontend NAMED the font it is editing. Falling back to "any font that
                // renders the char" would hand back a DIFFERENT font's charcodes, which the
                // frontend then writes into the named font's text object - wrong glyph, and the
                // backend strategy skips all frontend validation. Report the char missing
                // instead so the caller takes its own fallback path.
                return null;
            }

            // 3) Legacy locator-only behaviour: first font whose ToUnicode renders the char.
            for (PDFont f : fonts) {
                if (probesToUnicode(f, wantChar)) return f;
            }
        } catch (RuntimeException ignore) {
            // Be defensive: any single bad font shouldn't sink the whole request.
        }
        return null;
    }

    /**
     * Apply {@code nameFilter}, then decide: exactly one candidate whose ToUnicode covers {@code
     * wantChar} wins; two+ probe-hits are AMBIGUOUS (null). With zero probe-hits, a single
     * name-matching font is still returned (font.encode() may handle chars without a ToUnicode -
     * common for Type0/Identity-H), but two+ name matches are again ambiguous.
     */
    private static PDFont selectUnambiguous(
            List<PDFont> fonts,
            String wantChar,
            java.util.function.Predicate<PDFont> nameFilter,
            String modeLabel) {
        List<PDFont> named = new ArrayList<>();
        for (PDFont f : fonts) {
            try {
                if (f.getName() != null && nameFilter.test(f)) named.add(f);
            } catch (RuntimeException ignore) {
            }
        }
        if (named.isEmpty()) return null;
        List<PDFont> probed = new ArrayList<>();
        for (PDFont f : named) {
            if (probesToUnicode(f, wantChar)) probed.add(f);
        }
        if (probed.size() == 1) return probed.get(0);
        if (probed.size() > 1) {
            log.debug(
                    "encodeCharcodes: {} name match ambiguous ({} fonts render locator '{}') -"
                            + " refusing cross-subset guess",
                    modeLabel,
                    probed.size(),
                    wantChar);
            return null;
        }
        return named.size() == 1 ? named.get(0) : null;
    }

    /** True when some charcode in the font's ToUnicode CMap maps to {@code wantChar}. */
    private static boolean probesToUnicode(PDFont font, String wantChar) {
        // Cheap inverse-CMap probe: iterate codes until we hit one whose toUnicode is wantChar.
        // For Type3 with at most ~16 glyphs, this is microseconds. For full Type0 subsets
        // it's a few-thousand-iteration scan.
        int upper = font.isStandard14() ? 256 : 0x10000;
        for (int cc = 0; cc < upper; cc++) {
            String u;
            try {
                u = font.toUnicode(cc);
            } catch (Exception ignore) {
                continue;
            }
            if (u != null && u.equals(wantChar)) return true;
        }
        return false;
    }

    /**
     * Breadth-first collection of every distinct font reachable from the page's resources AND every
     * nested form XObject's resources (bounded by {@link #MAX_RESOURCE_DICTS}, cycle-safe, deduped
     * by COS dictionary identity). The v2 reader surfaces form-XObject text as editable, so its
     * fonts must be findable too.
     */
    private static List<PDFont> collectResourceTreeFonts(PDResources resources) {
        List<PDFont> out = new ArrayList<>();
        java.util.ArrayDeque<PDResources> queue = new java.util.ArrayDeque<>();
        java.util.Set<org.apache.pdfbox.cos.COSDictionary> seenDicts =
                java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        java.util.Set<org.apache.pdfbox.cos.COSDictionary> seenFonts =
                java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        if (resources != null) queue.add(resources);
        int visited = 0;
        // Bound a crafted page declaring many fonts none of which match (CPU-DoS guard).
        final int MAX_FONTS = 64;
        while (!queue.isEmpty() && visited < MAX_RESOURCE_DICTS) {
            PDResources res = queue.poll();
            if (!seenDicts.add(res.getCOSObject())) continue;
            visited++;
            for (org.apache.pdfbox.cos.COSName name : res.getFontNames()) {
                if (out.size() >= MAX_FONTS) break;
                PDFont font;
                try {
                    font = res.getFont(name);
                } catch (IOException | RuntimeException e) {
                    continue;
                }
                if (font == null || !seenFonts.add(font.getCOSObject())) continue;
                out.add(font);
            }
            try {
                for (org.apache.pdfbox.cos.COSName xn : res.getXObjectNames()) {
                    try {
                        org.apache.pdfbox.pdmodel.graphics.PDXObject xo = res.getXObject(xn);
                        if (xo
                                instanceof
                                org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject form) {
                            PDResources fr = form.getResources();
                            if (fr != null) queue.add(fr);
                        }
                    } catch (IOException | RuntimeException ignore) {
                    }
                }
            } catch (RuntimeException ignore) {
            }
        }
        return out;
    }

    /**
     * SHA-256 (lowercase hex) of a font's embedded program bytes - the decoded
     * FontFile/FontFile2/FontFile3 stream, which is byte-identical to what PDFium's
     * FPDFFont_GetFontData hands the frontend. Null when the font embeds no program.
     */
    private static String fontProgramSha256(PDFont font) {
        try {
            org.apache.pdfbox.pdmodel.font.PDFontDescriptor fd = font.getFontDescriptor();
            if (fd == null && font instanceof org.apache.pdfbox.pdmodel.font.PDType0Font type0) {
                fd = type0.getDescendantFont().getFontDescriptor();
            }
            if (fd == null) return null;
            org.apache.pdfbox.pdmodel.common.PDStream stream = fd.getFontFile2();
            if (stream == null) stream = fd.getFontFile3();
            if (stream == null) stream = fd.getFontFile();
            if (stream == null) return null;
            return sha256Hex(stream.toByteArray());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** Drop the 6-letter "ABCDEF+" subset prefix PDF puts on subset /BaseFont names. */
    private static String stripSubsetTag(String fontName) {
        if (fontName == null) return null;
        if (fontName.length() > 7
                && fontName.charAt(6) == '+'
                && fontName.chars().limit(6).allMatch(c -> c >= 'A' && c <= 'Z')) {
            return fontName.substring(7);
        }
        return fontName;
    }

    /**
     * Build a Unicode→charcode map for a font by iterating every charcode in 0..0xFFFF and asking
     * the font's ToUnicode CMap what Unicode it maps to. Charcodes that aren't in the CMap throw
     * inside toUnicode (PDFBox returns null or throws depending on font subtype), and those are
     * skipped silently.
     *
     * <p>This is the encoding inverse PDFBox doesn't expose directly. For Type3 fonts (where
     * font.encode() throws "Not implemented"), this is the ONLY way to write text in the same font
     * - we look up the user's char in the reverse map and pass that charcode to
     * FPDFText_SetCharcodes on the frontend.
     *
     * <p>The 0..0xFFFF range is sufficient for Type0/CIDFontType2 fonts (CIDs are 16-bit). For
     * single-byte fonts the loop short-circuits after 256. We don't go higher because no PDF font
     * has a CID outside that range in practice; the per-font result is memoised in {@link
     * #REVERSE_MAP_CACHE} so the 65 536-entry probe runs once per document+font, not per request.
     */
    private static java.util.Map<String, Long> buildReverseUnicodeMap(
            byte[] pdfBytes, PDFont font, int pageIndex, String locatorChar) {
        // Cache across requests so repeated edits on the SAME document reuse the 0..0xFFFF probe
        // instead of rebuilding it on every keystroke's request. Key preference:
        //
        //   1. (PDF content hash | font PROGRAM hash): fully font-specific. Two same-family
        //      subsets - or even two fonts sharing a /BaseFont after a merge - never collide,
        //      because distinct subsets embed distinct program bytes.
        //   2. (PDF content hash | font name): fonts with a name but no embedded program.
        //   3. (PDF content hash | page + locator char) for NAME-LESS fonts (Skia/Chrome Type3
        //      output has no /BaseFont): sharing one "hash|null" entry would serve every name-less
        //      font the FIRST one's map (wrong glyphs, trusted by the frontend). For identical
        //      bytes the font located from those inputs is deterministic, so the cached map always
        //      belongs to the font that will consume it.
        String programSha = fontProgramSha256(font);
        String fname = font.getName();
        String key;
        if (programSha != null || fname != null) {
            // Program hash AND name together: strictly more precise than either alone (covers
            // same-name sibling subsets AND one shared program stream under two names).
            key = sha256Hex(pdfBytes) + "|f|" + programSha + "|n|" + fname;
        } else {
            key = sha256Hex(pdfBytes) + "|p" + pageIndex + "|c|" + locatorChar;
        }
        return REVERSE_MAP_CACHE.computeIfAbsent(key, k -> computeReverseUnicodeMap(font));
    }

    /** Lowercase hex SHA-256 of the PDF bytes; used as the reverse-map cache key. */
    private static String sha256Hex(byte[] bytes) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xf, 16));
                sb.append(Character.forDigit(b & 0xf, 16));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            // SHA-256 is always present in a JRE; fall back to a length+hash key just in case so
            // the cache still functions (correctness holds - collisions only cost a rebuild).
            return bytes.length + ":" + java.util.Arrays.hashCode(bytes);
        }
    }

    private static java.util.Map<String, Long> computeReverseUnicodeMap(PDFont font) {
        java.util.Map<String, Long> out = new java.util.HashMap<>();
        int upper = font.isStandard14() ? 256 : 0x10000;
        for (int cc = 0; cc < upper; cc++) {
            String u;
            try {
                u = font.toUnicode(cc);
            } catch (Exception ignore) {
                continue;
            }
            if (u == null || u.isEmpty()) continue;
            // First charcode wins for a given Unicode (the canonical mapping).
            out.putIfAbsent(u, (long) cc);
        }
        return out;
    }
}
