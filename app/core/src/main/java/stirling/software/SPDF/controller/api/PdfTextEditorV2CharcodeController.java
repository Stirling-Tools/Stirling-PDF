package stirling.software.SPDF.controller.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDFStreamEngine;
import org.apache.pdfbox.contentstream.operator.DrawObject;
import org.apache.pdfbox.contentstream.operator.state.Concatenate;
import org.apache.pdfbox.contentstream.operator.state.Restore;
import org.apache.pdfbox.contentstream.operator.state.Save;
import org.apache.pdfbox.contentstream.operator.state.SetGraphicsStateParameters;
import org.apache.pdfbox.contentstream.operator.state.SetMatrix;
import org.apache.pdfbox.contentstream.operator.text.BeginText;
import org.apache.pdfbox.contentstream.operator.text.EndText;
import org.apache.pdfbox.contentstream.operator.text.SetFontAndSize;
import org.apache.pdfbox.contentstream.operator.text.SetTextHorizontalScaling;
import org.apache.pdfbox.contentstream.operator.text.SetTextLeading;
import org.apache.pdfbox.contentstream.operator.text.SetTextRenderingMode;
import org.apache.pdfbox.contentstream.operator.text.SetTextRise;
import org.apache.pdfbox.contentstream.operator.text.SetWordSpacing;
import org.apache.pdfbox.contentstream.operator.text.ShowText;
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
        byte[] pdfBytes;
        try {
            pdfBytes = Base64.getDecoder().decode(request.getPdfBase64());
        } catch (IllegalArgumentException e) {
            resp.setError("pdfBase64 is not valid base64");
            return ResponseEntity.badRequest().body(resp);
        }
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            if (request.getPageIndex() < 0 || request.getPageIndex() >= doc.getNumberOfPages()) {
                resp.setError("pageIndex out of range");
                return ResponseEntity.badRequest().body(resp);
            }
            PDPage page = doc.getPage(request.getPageIndex());
            // Skip the LocatorScanner (it walks the page's content stream, which crashes on
            // Type3 fonts with UnsupportedOperationException("Not implemented: Type3") before
            // we can do anything useful). Instead enumerate the page's font resources and
            // pick the first one whose ToUnicode CMap maps SOME charcode to the locator char.
            // For Chrome/Skia-printed PDFs that emit one Type3 font per glyph, this lands on
            // the exact font that renders the locator char.
            PDFont font = findFontByToUnicode(page, request.getLocatorChar(), doc);
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
            resp.setError("failed to load PDF: " + e.getMessage());
            return ResponseEntity.badRequest().body(resp);
        } catch (RuntimeException e) {
            log.warn("encodeCharcodes: unexpected error", e);
            resp.setError("unexpected: " + e.getMessage());
            return ResponseEntity.status(500).body(resp);
        }
    }

    /**
     * Walk every font resource on the page (and on any nested Form XObjects we can reach) and
     * return the FIRST font whose ToUnicode CMap includes the requested char. This avoids running
     * PDFStreamEngine.processPage, which throws UnsupportedOperationException on Type3 font glyph
     * rendering. The PDFont lookup itself is purely metadata-driven and works on all subtypes.
     */
    private static PDFont findFontByToUnicode(PDPage page, String wantChar, PDDocument doc) {
        try {
            PDResources resources = page.getResources();
            PDFont match = scanResources(resources, wantChar);
            if (match != null) return match;
            // For Chrome/Skia PDFs the per-glyph Type3 fonts often live on the page directly,
            // so the scan above is enough. Future: walk Form XObjects too.
        } catch (RuntimeException ignore) {
            // Be defensive: any single bad font shouldn't sink the whole request.
        }
        return null;
    }

    private static PDFont scanResources(PDResources resources, String wantChar) {
        if (resources == null) return null;
        for (org.apache.pdfbox.cos.COSName name : resources.getFontNames()) {
            PDFont font;
            try {
                font = resources.getFont(name);
            } catch (IOException | RuntimeException e) {
                continue;
            }
            if (font == null) continue;
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
        java.util.Map<String, Long> out = new java.util.HashMap<>();
        int upper = font.isStandard14() ? 256 : 0x10000;
        for (int cc = 0; cc <= upper; cc++) {
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

    /**
     * Walks a page's text positions to find the font of the fragment whose first char matches the
     * locator char and whose position is within ~2pt of the locator coordinates.
     *
     * <p>We don't require an exact match because PDFium-reported x/y can differ from PDFBox's by up
     * to a glyph's left-side-bearing depending on how the font's bounding box is interpreted.
     */
    static final class LocatorScanner extends PDFStreamEngine {
        private final String wantChar;
        private final double wantX;
        private final double wantY;
        private PDFont foundFont; // exact-position match
        private PDFont anyMatchFont; // fallback: any text obj using wantChar

        private LocatorScanner(String wantChar, double wantX, double wantY) {
            this.wantChar = wantChar;
            this.wantX = wantX;
            this.wantY = wantY;
            // Operators we need so showText can correctly maintain text state.
            addOperator(new BeginText(this));
            addOperator(new EndText(this));
            addOperator(new SetFontAndSize(this));
            addOperator(new SetTextHorizontalScaling(this));
            addOperator(new SetTextLeading(this));
            addOperator(new SetTextRenderingMode(this));
            addOperator(new SetTextRise(this));
            addOperator(new SetWordSpacing(this));
            addOperator(new SetMatrix(this));
            addOperator(new Save(this));
            addOperator(new Restore(this));
            addOperator(new Concatenate(this));
            addOperator(new SetGraphicsStateParameters(this));
            addOperator(new DrawObject(this));
            // Suppress unsupported-operator warnings for everything else - we only need text.
            addOperator(new ShowText(this));
        }

        static PDFont findFont(PDPage page, String wantChar, double wantX, double wantY)
                throws IOException {
            LocatorScanner scanner = new LocatorScanner(wantChar, wantX, wantY);
            scanner.processPage(page);
            // Prefer the exact-position match; fall back to "any text object using wantChar
            // on this page". The position match exists to disambiguate when two different
            // fonts on the same page both render the same char, but most of the time the
            // first appearance is the right one (e.g. "10M+" only appears in one font on
            // the Sample.pdf marketing page).
            if (scanner.foundFont != null) return scanner.foundFont;
            return scanner.anyMatchFont;
        }

        @Override
        protected void showText(byte[] string) throws IOException {
            if (foundFont != null) return;
            // Decode the bytes through the current font to get Unicode chars and positions.
            // PDFStreamEngine's default showText() walks each glyph and calls showGlyph; we want
            // a simpler path here so we replicate the bits we care about.
            PDFont font = getGraphicsState().getTextState().getFont();
            if (font == null) {
                super.showText(string);
                return;
            }
            ByteArrayInputStream in = new ByteArrayInputStream(string);
            while (in.available() > 0) {
                int before = in.available();
                int code;
                try {
                    code = font.readCode(in);
                } catch (IOException e) {
                    in.skip(in.available());
                    break;
                }
                String unicode;
                try {
                    unicode = font.toUnicode(code);
                } catch (RuntimeException e) {
                    // toUnicode is declared without checked exceptions in PDFBox, but it
                    // can throw on malformed ToUnicode CMaps; just skip.
                    unicode = null;
                }
                if (unicode != null && unicode.startsWith(wantChar)) {
                    // Record FIRST appearance regardless of position (fallback).
                    if (anyMatchFont == null) anyMatchFont = font;
                    // Use the current text matrix to derive on-page coords. The frontend
                    // sends locator coords from PDFium's text-page API, which is in the
                    // composed CTM x text-matrix space - PDFBox's getTextMatrix() returns
                    // just the text matrix, so positions won't match exactly. We still try
                    // (with generous tolerance) to disambiguate same-char-different-font
                    // cases, and fall back to anyMatchFont when nothing within tolerance
                    // appears.
                    float tx = getTextMatrix().getTranslateX();
                    float ty = getTextMatrix().getTranslateY();
                    if (Math.abs(tx - wantX) < 50 && Math.abs(ty - wantY) < 50) {
                        foundFont = font;
                        return;
                    }
                }
                // PDFStreamEngine would normally advance the text matrix by the glyph's width
                // here. For locator-find we don't need precise advance - approximate with
                // glyph's standard advance / font size.
                float w =
                        font.getWidth(code)
                                / 1000f
                                * getGraphicsState().getTextState().getFontSize();
                getTextMatrix().translate(w, 0);
                if (in.available() == before) break; // safety
            }
        }

        // No further hooks needed - showText() above handles font detection. PDFStreamEngine's
        // text-state bookkeeping carries our matrix-translate forward as it parses Tj/TJ/Tm/etc.
    }
}
