package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Base64;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.controller.api.PdfTextEditorV2CharcodeController.EncodeCharcodesRequest;
import stirling.software.SPDF.controller.api.PdfTextEditorV2CharcodeController.EncodeCharcodesResponse;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Regression coverage for the v2 text editor "spaces render as „" bug.
 *
 * <p>mushroom-life.pdf is a LaTeX document whose embedded LMRoman subset font has NO real space
 * glyph, yet {@code font.encode(" ")} still returns charcode 0x20 without throwing. Reusing that
 * code via {@code FPDFText_SetCharcodes} paints whatever glyph sits at subset code 0x20 - the
 * quotedblbase „. The controller must therefore report whitespace as {@code missing} so the
 * frontend emits it as a positional gap instead of a reused glyph.
 */
class PdfTextEditorV2CharcodeControllerTest {

    private static PdfTextEditorV2CharcodeController controller() {
        return new PdfTextEditorV2CharcodeController(
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class)));
    }

    private static String mushroomBase64() throws Exception {
        try (InputStream in =
                PdfTextEditorV2CharcodeControllerTest.class.getResourceAsStream(
                        "/pdftexteditor/mushroom-life.pdf")) {
            assertThat(in).as("mushroom-life.pdf test resource").isNotNull();
            return Base64.getEncoder().encodeToString(in.readAllBytes());
        }
    }

    private static EncodeCharcodesRequest request(String text) throws Exception {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(mushroomBase64());
        req.setPageIndex(0);
        // findFontByToUnicode locates the font via the ToUnicode CMap - "M" exists on page 0.
        req.setLocatorChar("M");
        req.setText(text);
        return req;
    }

    @Test
    void spaceIsReportedMissingNeverEncoded() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request(" "));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        // The space must be reported missing, NOT handed back as a charcode
        // (0x20) the frontend would reuse into the „ glyph.
        assertThat(body.getMissing()).containsExactly(" ");
        assertThat(body.getCharcodes()).isNullOrEmpty();
    }

    @Test
    void realCharsEncodeWhileWhitespaceStaysAGap() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();
        // "M M" - both M's must encode to real charcodes; only the space is a gap.
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request("M M"));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getCharcodes()).as("both M glyphs encode").hasSize(2);
        assertThat(body.getMissing()).containsExactly(" ");
    }

    @Test
    void tabAndNewlineAreAlsoTreatedAsGaps() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();
        ResponseEntity<EncodeCharcodesResponse> resp = controller.encodeCharcodes(request("\t\n"));

        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getMissing()).containsExactly("\t", "\n");
        assertThat(body.getCharcodes()).isNullOrEmpty();
    }

    /**
     * A page with two fonts that BOTH render 'A'. {@code fontName} must select which one to encode
     * against - the cross-font fix. Without it the first font in resources order won wins and a
     * cross-font edit got the wrong font's charcode.
     */
    private static String twoFontBase64() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDType1Font helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            PDType1Font times = new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(helvetica, 12);
                cs.newLineAtOffset(72, 720);
                cs.showText("A");
                cs.endText();
                cs.beginText();
                cs.setFont(times, 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("A");
                cs.endText();
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return Base64.getEncoder().encodeToString(bos.toByteArray());
        }
    }

    private static EncodeCharcodesRequest twoFontRequest(String fontName) throws Exception {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(twoFontBase64());
        req.setPageIndex(0);
        req.setLocatorChar("A");
        req.setFontName(fontName);
        req.setText("A");
        return req;
    }

    @Test
    void fontNameDisambiguatesBetweenTwoFontsRenderingTheSameChar() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();

        // Targeting Times-Roman must encode against Times-Roman, not whichever
        // font happens to appear first in the page's font resources.
        EncodeCharcodesResponse times =
                controller.encodeCharcodes(twoFontRequest("Times-Roman")).getBody();
        assertThat(times).isNotNull();
        assertThat(times.getError()).isNull();
        assertThat(times.getNote()).contains("Times-Roman");
        assertThat(times.getCharcodes()).hasSize(1);

        // Targeting Helvetica must encode against Helvetica.
        EncodeCharcodesResponse helv =
                controller.encodeCharcodes(twoFontRequest("Helvetica")).getBody();
        assertThat(helv).isNotNull();
        assertThat(helv.getError()).isNull();
        assertThat(helv.getNote()).contains("Helvetica");
        assertThat(helv.getCharcodes()).hasSize(1);
    }

    @Test
    void unknownFontNameReportsNoFontInsteadOfWrongFont() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();
        // A name that matches no font on the page must NOT silently encode
        // against a different font: the frontend writes the returned charcodes
        // into the NAMED font's text object, so a first-match fallback would
        // bake wrong glyphs. It must report failure so the caller falls back.
        EncodeCharcodesResponse body =
                controller.encodeCharcodes(twoFontRequest("DoesNotExist")).getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).contains("no font");
        assertThat(body.getCharcodes()).isNull();
    }

    @Test
    void missingRequiredFieldsReturns400() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64("AAAA");
        req.setLocatorChar("M");
        // text is null
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().getError()).isEqualTo("missing required fields");
    }

    @Test
    void invalidBase64Returns400() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64("!!!notbase64!!!");
        req.setLocatorChar("M");
        req.setText("M");
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().getError()).isEqualTo("pdfBase64 is not valid base64");
    }

    @Test
    void pageIndexOutOfRangeReturns400() throws Exception {
        EncodeCharcodesRequest req = request("M");
        req.setPageIndex(999);
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(400);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().getError()).isEqualTo("pageIndex out of range");
    }

    @Test
    void nonPdfBytesReturnsGenericError() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(Base64.getEncoder().encodeToString("not a pdf".getBytes()));
        req.setLocatorChar("M");
        req.setText("M");
        // Must not throw, and must not leak the raw PDFBox parser message.
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().is4xxClientError()).isTrue();
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().getError()).isEqualTo("failed to load PDF");
    }

    @Test
    void absentLocatorCharReturns200WithError() throws Exception {
        // U+FFFF never appears in the document, so no font matches.
        ResponseEntity<EncodeCharcodesResponse> resp =
                controller().encodeCharcodes(requestWithLocator("￿"));
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNotNull();
        assertThat(body.getCharcodes()).isNull();
    }

    @Test
    void oversizePdfRejected() {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        // A base64 string long enough that length/4*3 exceeds the 100MB cap, without
        // ever allocating the decoded bytes (the guard runs before decode).
        char[] huge = new char[140 * 1024 * 1024];
        java.util.Arrays.fill(huge, 'A');
        req.setPdfBase64(new String(huge));
        req.setLocatorChar("M");
        req.setText("M");
        ResponseEntity<EncodeCharcodesResponse> resp = controller().encodeCharcodes(req);
        assertThat(resp.getStatusCode().value()).isEqualTo(413);
        assertThat(resp.getBody()).isNotNull();
        assertThat(resp.getBody().getError()).isEqualTo("pdf too large");
    }

    private static EncodeCharcodesRequest requestWithLocator(String locator) throws Exception {
        EncodeCharcodesRequest req = request("M");
        req.setLocatorChar(locator);
        return req;
    }

    /**
     * Build a page whose resources declare {@code filler} fonts that do NOT render 'A' (Symbol /
     * ZapfDingbats have non-Latin encodings) plus, optionally, a trailing Helvetica that does. The
     * Standard14 probe upper bound is 256 so each scan is cheap.
     */
    private static String manyFontsBase64(int filler, boolean trailingTarget) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            org.apache.pdfbox.pdmodel.PDResources resources =
                    new org.apache.pdfbox.pdmodel.PDResources();
            for (int n = 0; n < filler; n++) {
                Standard14Fonts.FontName fn =
                        (n % 2 == 0)
                                ? Standard14Fonts.FontName.SYMBOL
                                : Standard14Fonts.FontName.ZAPF_DINGBATS;
                resources.put(
                        org.apache.pdfbox.cos.COSName.getPDFName("Ff" + n), new PDType1Font(fn));
            }
            if (trailingTarget) {
                resources.put(
                        org.apache.pdfbox.cos.COSName.getPDFName("Target"),
                        new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            }
            page.setResources(resources);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return Base64.getEncoder().encodeToString(bos.toByteArray());
        }
    }

    private static EncodeCharcodesRequest manyFontsRequest(String base64) {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(base64);
        req.setPageIndex(0);
        req.setLocatorChar("A");
        req.setText("A");
        return req;
    }

    @Test
    void targetFontFoundAmongManyFonts() throws Exception {
        // 60 non-matching fonts then the Helvetica target, all within the 64-font cap.
        ResponseEntity<EncodeCharcodesResponse> resp =
                controller().encodeCharcodes(manyFontsRequest(manyFontsBase64(60, true)));
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getCharcodes()).hasSize(1);
    }

    @Test
    void targetBeyondFontCapReturnsGracefulNoFont() throws Exception {
        // 64 non-matching fonts then the target at position 65 - the scan cap stops
        // before reaching it, so we get a graceful no-font error rather than a full scan.
        ResponseEntity<EncodeCharcodesResponse> resp =
                controller().encodeCharcodes(manyFontsRequest(manyFontsBase64(64, true)));
        assertThat(resp.getStatusCode().value()).isEqualTo(200);
        EncodeCharcodesResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNotNull();
        assertThat(body.getCharcodes()).isNull();
    }

    // ------------------------------------------------------------------
    // Same-family sibling subsets (the Mangum-CV corruption).
    //
    // A Word/Quartz-printed CV embedded FOUR subsets of Garamond, each
    // re-encoded by order of first glyph use, so the same letter has a
    // DIFFERENT charcode in each subset ("R" = 0x21 in one, 0x22 in its
    // sibling). PDFium reports every one of them as plain "Garamond"
    // (FPDFFont_GetBaseFontName strips the "ABCDEF+" tag), so a
    // name-based lookup picked whichever sibling scanned first and its
    // charcodes - written into the OTHER subset's text object - rendered
    // "RUSSELL W. MANGUM III" as "US EEL W. MANGS M III".
    //
    // The synthetic doc below mirrors that: two TrueType subsets whose
    // /BaseFont differs only by subset tag, with ToUnicode maps assigning
    // DIFFERENT codes to the same char. PUA code points keep the test
    // deterministic: font.encode() cannot resolve them via glyph names,
    // so the returned charcode always comes from the selected font's
    // ToUnicode reverse map - i.e. it proves WHICH font was selected.
    // ------------------------------------------------------------------

    private static final String PUA = "";

    /** ToUnicode CMap mapping each supplied charcode to a BMP code point. */
    private static byte[] toUnicodeCmap(int[][] codeToUnicode) {
        StringBuilder sb =
                new StringBuilder(
                        """
                        /CIDInit /ProcSet findresource begin
                        12 dict begin
                        begincmap
                        /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
                        /CMapName /Adobe-Identity-UCS def
                        /CMapType 2 def
                        1 begincodespacerange
                        <00><FF>
                        endcodespacerange
                        """);
        sb.append(codeToUnicode.length).append(" beginbfchar\n");
        for (int[] pair : codeToUnicode) {
            sb.append(String.format("<%02X><%04X>%n", pair[0], pair[1]));
        }
        sb.append(
                """
                endbfchar
                endcmap
                CMapName currentdict /CMap defineresource pop
                end
                end
                """);
        return sb.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    }

    /** One TrueType subset font dict with an embedded (fake) program + ToUnicode. */
    private static org.apache.pdfbox.cos.COSDictionary subsetFontDict(
            PDDocument doc, String baseName, byte[] fontProgram, byte[] toUnicode)
            throws Exception {
        org.apache.pdfbox.cos.COSDictionary font = new org.apache.pdfbox.cos.COSDictionary();
        font.setItem(org.apache.pdfbox.cos.COSName.TYPE, org.apache.pdfbox.cos.COSName.FONT);
        font.setItem(
                org.apache.pdfbox.cos.COSName.SUBTYPE, org.apache.pdfbox.cos.COSName.TRUE_TYPE);
        font.setName(org.apache.pdfbox.cos.COSName.BASE_FONT, baseName);
        font.setInt(org.apache.pdfbox.cos.COSName.FIRST_CHAR, 0x21);
        font.setInt(org.apache.pdfbox.cos.COSName.LAST_CHAR, 0x22);
        org.apache.pdfbox.cos.COSArray widths = new org.apache.pdfbox.cos.COSArray();
        widths.add(org.apache.pdfbox.cos.COSInteger.get(500));
        widths.add(org.apache.pdfbox.cos.COSInteger.get(500));
        font.setItem(org.apache.pdfbox.cos.COSName.WIDTHS, widths);

        org.apache.pdfbox.cos.COSDictionary fd = new org.apache.pdfbox.cos.COSDictionary();
        fd.setItem(org.apache.pdfbox.cos.COSName.TYPE, org.apache.pdfbox.cos.COSName.FONT_DESC);
        fd.setName(org.apache.pdfbox.cos.COSName.FONT_NAME, baseName);
        fd.setInt(org.apache.pdfbox.cos.COSName.FLAGS, 4);
        fd.setItem(
                org.apache.pdfbox.cos.COSName.FONT_BBOX,
                new org.apache.pdfbox.pdmodel.common.PDRectangle(0, 0, 1000, 1000).getCOSArray());
        fd.setInt(org.apache.pdfbox.cos.COSName.ITALIC_ANGLE, 0);
        fd.setInt(org.apache.pdfbox.cos.COSName.ASCENT, 800);
        fd.setInt(org.apache.pdfbox.cos.COSName.DESCENT, -200);
        fd.setInt(org.apache.pdfbox.cos.COSName.CAP_HEIGHT, 700);
        fd.setInt(org.apache.pdfbox.cos.COSName.STEM_V, 80);
        org.apache.pdfbox.pdmodel.common.PDStream ff2 =
                new org.apache.pdfbox.pdmodel.common.PDStream(
                        doc, new java.io.ByteArrayInputStream(fontProgram));
        ff2.getCOSObject().setInt(org.apache.pdfbox.cos.COSName.LENGTH1, fontProgram.length);
        fd.setItem(org.apache.pdfbox.cos.COSName.FONT_FILE2, ff2.getCOSObject());
        font.setItem(org.apache.pdfbox.cos.COSName.FONT_DESC, fd);

        org.apache.pdfbox.pdmodel.common.PDStream tu =
                new org.apache.pdfbox.pdmodel.common.PDStream(
                        doc, new java.io.ByteArrayInputStream(toUnicode));
        font.setItem(org.apache.pdfbox.cos.COSName.getPDFName("ToUnicode"), tu.getCOSObject());
        return font;
    }

    // Distinct fake font programs - hashing distinguishes the subsets by these bytes.
    private static final byte[] PROGRAM_A =
            "fake-ttf-program-A".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    private static final byte[] PROGRAM_B =
            "fake-ttf-program-B".getBytes(java.nio.charset.StandardCharsets.US_ASCII);

    /**
     * Two sibling subsets of "FakeGaramond" whose ToUnicode maps give U+E000 DIFFERENT charcodes:
     * 0x22 in subset A (AAAAAC+), 0x21 in subset B (AAAAAG+) - exactly the CV's shifted-code
     * layout. {@code includeSecond=false} keeps only subset A for the unambiguous-fallback case.
     */
    private static String siblingSubsetsBase64(boolean includeSecond) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            org.apache.pdfbox.cos.COSDictionary fonts = new org.apache.pdfbox.cos.COSDictionary();
            fonts.setItem(
                    org.apache.pdfbox.cos.COSName.getPDFName("TTA"),
                    subsetFontDict(
                            doc,
                            "AAAAAC+FakeGaramond",
                            PROGRAM_A,
                            toUnicodeCmap(new int[][] {{0x21, 0xE001}, {0x22, 0xE000}})));
            if (includeSecond) {
                fonts.setItem(
                        org.apache.pdfbox.cos.COSName.getPDFName("TTB"),
                        subsetFontDict(
                                doc,
                                "AAAAAG+FakeGaramond",
                                PROGRAM_B,
                                toUnicodeCmap(new int[][] {{0x21, 0xE000}, {0x22, 0xE002}})));
            }
            org.apache.pdfbox.pdmodel.PDResources resources =
                    new org.apache.pdfbox.pdmodel.PDResources();
            resources.getCOSObject().setItem(org.apache.pdfbox.cos.COSName.FONT, fonts);
            page.setResources(resources);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.save(bos);
            return Base64.getEncoder().encodeToString(bos.toByteArray());
        }
    }

    private static String sha256Hex(byte[] bytes) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : digest) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static EncodeCharcodesRequest siblingRequest(
            String base64, String fontName, String fontSha256) {
        EncodeCharcodesRequest req = new EncodeCharcodesRequest();
        req.setPdfBase64(base64);
        req.setPageIndex(0);
        req.setLocatorChar(PUA);
        req.setFontName(fontName);
        req.setFontSha256(fontSha256);
        req.setText(PUA);
        return req;
    }

    @Test
    void fontProgramHashSelectsTheExactSubset() throws Exception {
        String base64 = siblingSubsetsBase64(true);
        PdfTextEditorV2CharcodeController controller = controller();

        // Both requests carry the SAME tag-stripped name PDFium reports ("FakeGaramond"),
        // so only the program hash can tell the subsets apart.
        EncodeCharcodesResponse viaA =
                controller
                        .encodeCharcodes(
                                siblingRequest(base64, "FakeGaramond", sha256Hex(PROGRAM_A)))
                        .getBody();
        assertThat(viaA).isNotNull();
        assertThat(viaA.getError()).isNull();
        assertThat(viaA.getNote()).contains("AAAAAC+FakeGaramond");
        assertThat(viaA.getCharcodes()).containsExactly(0x22L);

        EncodeCharcodesResponse viaB =
                controller
                        .encodeCharcodes(
                                siblingRequest(base64, "FakeGaramond", sha256Hex(PROGRAM_B)))
                        .getBody();
        assertThat(viaB).isNotNull();
        assertThat(viaB.getError()).isNull();
        assertThat(viaB.getNote()).contains("AAAAAG+FakeGaramond");
        assertThat(viaB.getCharcodes()).containsExactly(0x21L);
    }

    @Test
    void ambiguousStrippedNameRefusesToGuessBetweenSiblingSubsets() throws Exception {
        // No hash, and the tag-stripped name matches BOTH subsets which both render the
        // locator char. Guessing here is what scrambled "RUSSELL W. MANGUM III" into
        // "US EEL W. MANGS M III" - the sibling's codes hit different glyphs. The
        // backend must refuse so the frontend takes its safe fallback.
        EncodeCharcodesResponse body =
                controller()
                        .encodeCharcodes(
                                siblingRequest(siblingSubsetsBase64(true), "FakeGaramond", null))
                        .getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).contains("no font");
        assertThat(body.getCharcodes()).isNull();
    }

    @Test
    void exactTaggedNameStillSelectsItsSubset() throws Exception {
        // A caller that DOES know the full tagged /BaseFont name keeps working.
        EncodeCharcodesResponse body =
                controller()
                        .encodeCharcodes(
                                siblingRequest(
                                        siblingSubsetsBase64(true), "AAAAAG+FakeGaramond", null))
                        .getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getNote()).contains("AAAAAG+FakeGaramond");
        assertThat(body.getCharcodes()).containsExactly(0x21L);
    }

    @Test
    void strippedNameStillWorksWhenUnambiguous() throws Exception {
        // With a SINGLE subset on the page, the tag-stripped name (what PDFium
        // reports) must keep resolving - the ambiguity guard only bites when
        // two+ siblings could answer.
        EncodeCharcodesResponse body =
                controller()
                        .encodeCharcodes(
                                siblingRequest(siblingSubsetsBase64(false), "FakeGaramond", null))
                        .getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getNote()).contains("AAAAAC+FakeGaramond");
        assertThat(body.getCharcodes()).containsExactly(0x22L);
    }

    @Test
    void staleHashFallsBackToNameMatching() throws Exception {
        // A hash matching NO font on the page (e.g. PDFium handed back a substitute
        // font's bytes) must not brick the request: name matching still runs, and an
        // exact tagged name resolves.
        EncodeCharcodesResponse body =
                controller()
                        .encodeCharcodes(
                                siblingRequest(
                                        siblingSubsetsBase64(true),
                                        "AAAAAC+FakeGaramond",
                                        "0000000000000000000000000000000000000000000000000000000000000000"))
                        .getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getNote()).contains("AAAAAC+FakeGaramond");
        assertThat(body.getCharcodes()).containsExactly(0x22L);
    }
}
