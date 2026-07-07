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
    void unknownFontNameFallsBackToFirstMatch() throws Exception {
        PdfTextEditorV2CharcodeController controller = controller();
        // A name that matches no font on the page must NOT error - it falls back
        // to the legacy first-font-with-the-char behaviour.
        EncodeCharcodesResponse body =
                controller.encodeCharcodes(twoFontRequest("DoesNotExist")).getBody();
        assertThat(body).isNotNull();
        assertThat(body.getError()).isNull();
        assertThat(body.getCharcodes()).hasSize(1);
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
}
