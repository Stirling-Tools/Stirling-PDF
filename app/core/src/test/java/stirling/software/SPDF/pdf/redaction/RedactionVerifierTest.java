package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.encoding.WinAnsiEncoding;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("RedactionVerifier")
class RedactionVerifierTest {

    private static final String LIBERATION =
            "/org/apache/pdfbox/resources/ttf/LiberationSans-Regular.ttf";

    @Test
    @DisplayName("surviving text fails verification")
    void survivingTextFails() throws Exception {
        byte[] bytes = helveticaPdf("Surviving Smith text");
        RedactionVerificationFailedException failure =
                assertThrows(
                        RedactionVerificationFailedException.class,
                        () -> RedactionVerifier.verify(bytes, Set.of("Smith"), List.of()));
        assertFalse(
                failure.getMessage().contains("Smith"),
                "the target must never appear in the failure message");
        assertTrue(failure.getMessage().contains("#1"), "the target is identified by ordinal");
    }

    @Test
    @DisplayName("a clean document passes verification")
    void cleanDocumentPasses() throws Exception {
        byte[] bytes = helveticaPdf("nothing sensitive here");
        assertDoesNotThrow(() -> RedactionVerifier.verify(bytes, Set.of("Smith"), List.of()));
    }

    @Test
    @DisplayName("a pattern failure reports the pattern ordinal, not the pattern text")
    void patternFailureDoesNotEchoPattern() throws Exception {
        byte[] bytes = helveticaPdf("account 123-45-6789 here");
        RedactionVerificationFailedException failure =
                assertThrows(
                        RedactionVerificationFailedException.class,
                        () ->
                                RedactionVerifier.verify(
                                        bytes,
                                        Set.of(),
                                        List.of(
                                                java.util.regex.Pattern.compile(
                                                        "\\d{3}-\\d{2}-\\d{4}"))));
        assertFalse(failure.getMessage().contains("\\d{3}"));
        assertTrue(failure.getMessage().contains("#1"));
    }

    @Test
    @DisplayName("/ActualText cannot mask a surviving glyph run")
    void actualTextDoesNotMaskSurvivor() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDResources res = new PDResources();
            res.put(COSName.getPDFName("F1"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            page.setResources(res);
            String content =
                    "/Span << /ActualText (SAFE) >> BDC BT /F1"
                            + " 12 Tf 100 700 Td (SECRET) Tj ET EMC";
            PDStream ps = new PDStream(doc);
            try (var out = ps.createOutputStream()) {
                out.write(content.getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(ps);
            bytes = save(doc);
        }
        assertThrows(
                RedactionVerificationFailedException.class,
                () -> RedactionVerifier.verify(bytes, Set.of("SECRET"), List.of()));
    }

    // Native-pass gate

    @Test
    @DisplayName("gate skips the native pass when every font is Standard-14")
    void gateSkipsForStandard14() throws Exception {
        try (PDDocument reopened = Loader.loadPDF(helveticaPdf("plain Helvetica text"))) {
            assertFalse(RedactionVerifier.documentHasUnreliableFont(reopened));
        }
    }

    @Test
    @DisplayName("gate runs the native pass for an embedded font without /ToUnicode")
    void gateRunsForNonStandardFontWithoutToUnicode() throws Exception {
        byte[] bytes = embeddedFontPdf(false);
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertTrue(RedactionVerifier.documentHasUnreliableFont(reopened));
        }
    }

    @Test
    @DisplayName("gate skips the native pass when a Type0 font carries /ToUnicode")
    void gateSkipsForType0WithToUnicode() throws Exception {
        byte[] bytes = embeddedFontPdf(true);
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(RedactionVerifier.documentHasUnreliableFont(reopened));
        }
    }

    @Test
    @DisplayName("gate distrusts a subset-embedded font's /ToUnicode")
    void gateRunsForSubsetFontEvenWithToUnicode() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, true);
            }
            writeLine(doc, page, font, "subset text");
            String tagged = "ABCDEF+" + font.getName();
            font.getCOSObject().setName(COSName.BASE_FONT, tagged);
            if (font.getFontDescriptor() != null) {
                font.getFontDescriptor().getCOSObject().setName(COSName.FONT_NAME, tagged);
            }
            bytes = save(doc);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertTrue(RedactionVerifier.documentHasUnreliableFont(reopened));
        }
    }

    @Test
    @DisplayName("gate recurses into form XObjects to find an unreliable font")
    void gateDetectsUnreliableFontInsideXObject() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDResources pageRes = new PDResources();
            pageRes.put(
                    COSName.getPDFName("PF"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));

            PDFormXObject form = new PDFormXObject(doc);
            PDResources formRes = new PDResources();
            PDFont embedded;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                embedded = PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
            }
            formRes.put(COSName.getPDFName("F1"), embedded);
            form.setResources(formRes);
            form.setBBox(new PDRectangle(0, 0, 200, 50));
            try (var out = form.getStream().createOutputStream()) {
                out.write(
                        "BT /F1 12 Tf 0 10 Td (hidden) Tj ET"
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            COSName formName = pageRes.add(form);
            page.setResources(pageRes);
            PDStream ps = new PDStream(doc);
            try (var out = ps.createOutputStream()) {
                out.write(
                        ("q 1 0 0 1 50 700 cm /" + formName.getName() + " Do Q")
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(ps);
            bytes = save(doc);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertTrue(RedactionVerifier.documentHasUnreliableFont(reopened));
        }
    }

    @Test
    @DisplayName("verify fails closed when the required native pass cannot run")
    void failsClosedWhenNativeUnavailableForUnreliableFont() throws Exception {
        byte[] bytes = embeddedFontPdf(false);
        RedactionVerifier.setJpdfiumAvailableForTest(false);
        try {
            assertThrows(
                    RedactionVerificationFailedException.class,
                    () -> RedactionVerifier.verify(bytes, Set.of("SECRET"), List.of()));
        } finally {
            RedactionVerifier.setJpdfiumAvailableForTest(true);
        }
    }

    // Helpers

    private static byte[] helveticaPdf(String line) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            writeLine(doc, page, new PDType1Font(Standard14Fonts.FontName.HELVETICA), line);
            return save(doc);
        }
    }

    /** type0=true keeps the generated /ToUnicode; false embeds a simple TrueType without one. */
    private static byte[] embeddedFontPdf(boolean type0) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font =
                        type0
                                ? PDType0Font.load(doc, ttf, false)
                                : PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
            }
            writeLine(doc, page, font, "keep me");
            return save(doc);
        }
    }

    private static void writeLine(PDDocument doc, PDPage page, PDFont font, String line)
            throws Exception {
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(font, 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(line);
            cs.endText();
        }
    }

    private static byte[] save(PDDocument doc) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }
}
