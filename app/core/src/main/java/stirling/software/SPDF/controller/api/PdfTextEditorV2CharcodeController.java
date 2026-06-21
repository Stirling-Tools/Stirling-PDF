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
 * question (page index + a sample char + the x/y of an existing rendering of that sample char) +
 * the Unicode text the frontend wants to encode. It returns the charcode sequence the frontend can
 * pass to {@code FPDFText_SetCharcodes}.
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
     * Cache the reverse Unicode map per font instance. PDFont instances are recreated per
     * PDDocument load, so this WeakHashMap is GC'd with the doc and bounds memory.
     */
    private static final java.util.Map<PDFont, java.util.Map<String, Long>> REVERSE_MAP_CACHE =
            java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /**
     * Permanently silence PDFBox's per-charcode "No Unicode mapping for .notdef" WARN spam
     * triggered by {@link #buildReverseUnicodeMap(PDFont)}. The reverse- CMap loop intentionally
     * probes every charcode in 0..0xFFFF; for any subset font the vast majority of those probes
     * return .notdef and PDSimpleFont logs a WARN for each one. Left unchecked this floods the log
     * with 64K entries per probe per font per request - the previous build wrote ~3.5 GB to
     * info.log in a few hours, which eventually starved Jetty's request threads and started
     * returning 500s. Suppressing the logger costs nothing because the warnings are not actionable
     * here: we DELIBERATELY want to iterate every charcode to discover which ones map to something.
     */
    static {
        try {
            ch.qos.logback.classic.Logger pdfboxFontLogger =
                    (ch.qos.logback.classic.Logger)
                            org.slf4j.LoggerFactory.getLogger(
                                    "org.apache.pdfbox.pdmodel.font.PDSimpleFont");
            pdfboxFontLogger.setLevel(ch.qos.logback.classic.Level.ERROR);
        } catch (Throwable ignore) {
            // Logger backend isn't Logback (e.g. unit test profile uses
            // logback-test) - fall through; the WARN cost is bearable in those
            // scenarios since the reverse-CMap loop isn't on the hot path
            // there.
        }
    }

    @Data
    public static class EncodeCharcodesRequest {

        /** Base64-encoded original PDF. The frontend already has the bytes loaded. */
        private String pdfBase64;

        /** 0-based page index containing the font sample. */
        private int pageIndex;

        /**
         * A char known to exist on the page in the target font. We use this together with {@code
         * locatorX} / {@code locatorY} to find the source PDFont via PDFBox.
         */
        private String locatorChar;

        /** PDF-space x of the existing locatorChar (in points, PDF origin lower-left). */
        private double locatorX;

        /** PDF-space y of the existing locatorChar. */
        private double locatorY;

        /**
         * Optional /BaseFont name of the target font (as PDFium's FPDFFont_GetBaseFontName reports
         * it). When a page has TWO fonts that both render {@code locatorChar}, this disambiguates
         * which one to encode against - otherwise the first font found wins and a cross-font edit
         * gets the wrong font's charcode. Null = keep the legacy first-match behaviour.
         */
        private String fontName;

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
        // length/4*3 bounds the decoded size without decoding, so we reject early before allocating.
        String b64 = request.getPdfBase64();
        if ((long) b64.length() / 4 * 3 > MAX_PDF_BYTES) {
            resp.setError("pdf too large");
            return ResponseEntity.status(413).body(resp);
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
            // useful). Instead enumerate the page's font resources and pick the first one whose
            // ToUnicode CMap maps SOME charcode to the locator char.
            // For Chrome/Skia-printed PDFs that emit one Type3 font per glyph, this lands on
            // the exact font that renders the locator char.
            PDFont font =
                    findFontByToUnicode(page, request.getLocatorChar(), request.getFontName(), doc);
            if (font == null) {
                resp.setError(
                        "no text fragment matching locatorChar="
                                + request.getLocatorChar()
                                + " near ("
                                + request.getLocatorX()
                                + ","
                                + request.getLocatorY()
                                + ")");
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
            java.util.Map<String, Long> reverseMap = buildReverseUnicodeMap(font);
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
     * Walk every font resource on the page (and on any nested Form XObjects we can reach) and
     * return the FIRST font whose ToUnicode CMap includes the requested char. This avoids running
     * PDFStreamEngine.processPage, which throws UnsupportedOperationException on Type3 font glyph
     * rendering. The PDFont lookup itself is purely metadata-driven and works on all subtypes.
     */
    private static PDFont findFontByToUnicode(
            PDPage page, String wantChar, String fontName, PDDocument doc) {
        try {
            PDResources resources = page.getResources();
            // First pass: if a target font name was supplied, prefer the font
            // whose /BaseFont matches AND renders the char. This disambiguates a
            // cross-font edit (two fonts both rendering wantChar). Falls through
            // to the legacy first-match when fontName is null or doesn't match.
            if (fontName != null && !fontName.isEmpty()) {
                PDFont named = scanResources(resources, wantChar, fontName);
                if (named != null) return named;
            }
            PDFont match = scanResources(resources, wantChar, null);
            if (match != null) return match;
            // For Chrome/Skia PDFs the per-glyph Type3 fonts often live on the page directly,
            // so the scan above is enough. Future: walk Form XObjects too.
        } catch (RuntimeException ignore) {
            // Be defensive: any single bad font shouldn't sink the whole request.
        }
        return null;
    }

    /**
     * Return a font on the page that renders {@code wantChar}. When {@code wantName} is non-null,
     * only a font whose /BaseFont equals it qualifies (cross-font disambiguation); otherwise the
     * first font with the char wins. The subset tag ("ABCDEF+") is ignored when comparing names so
     * a re-saved subset still matches.
     */
    private static PDFont scanResources(PDResources resources, String wantChar, String wantName) {
        if (resources == null) return null;
        String wantBase = stripSubsetTag(wantName);
        // Bound a crafted page declaring many fonts none of which match (CPU-DoS guard).
        int scanned = 0;
        final int MAX_FONTS = 64;
        for (org.apache.pdfbox.cos.COSName name : resources.getFontNames()) {
            if (++scanned > MAX_FONTS) break;
            PDFont font;
            try {
                font = resources.getFont(name);
            } catch (IOException | RuntimeException e) {
                continue;
            }
            if (font == null) continue;
            if (wantBase != null && !wantBase.equals(stripSubsetTag(font.getName()))) {
                continue;
            }
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
                if (u != null && u.equals(wantChar)) return font;
            }
        }
        return null;
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
     * single-byte fonts the loop short-circuits after 256. We don't go higher because (a) no PDF
     * font has a CID outside that range in practice, (b) iterating 65536 entries per request is
     * already a perceptible delay we'll cache later.
     */
    private static java.util.Map<String, Long> buildReverseUnicodeMap(PDFont font) {
        // Cache per font instance. Cross-request reuse would need keying on font-dict bytes
        // (out of scope); each request loads a new PDDocument hence a new PDFont.
        return REVERSE_MAP_CACHE.computeIfAbsent(
                font, PdfTextEditorV2CharcodeController::computeReverseUnicodeMap);
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
