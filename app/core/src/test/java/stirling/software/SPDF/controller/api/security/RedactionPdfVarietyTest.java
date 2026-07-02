package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDFormContentStream;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.encoding.MacRomanEncoding;
import org.apache.pdfbox.pdmodel.font.encoding.WinAnsiEncoding;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.SPDF.pdf.redaction.RedactionPipeline;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/** Security matrix for redaction across PDF shapes: standard and embedded */
@DisplayName("Redaction PDF-variety security matrix")
class RedactionPdfVarietyTest {

    private static final String LIBERATION =
            "/org/apache/pdfbox/resources/ttf/LiberationSans-Regular.ttf";
    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private RedactController controller;

    private final List<File> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        pdfDocumentFactory = mock(CustomPDFDocumentFactory.class);
        tempFileManager = mock(TempFileManager.class);

        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "redact-variety", inv.<String>getArgument(0))
                                            .toFile();
                            createdTempFiles.add(f);
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        controller =
                new RedactController(
                        pdfDocumentFactory,
                        tempFileManager,
                        new ManualRedactionService(tempFileManager),
                        new TextRedactionService(),
                        mock(RedactExecuteService.class));
    }

    @AfterEach
    void tearDown() {
        for (File f : createdTempFiles) {
            if (f != null && f.exists()) {
                f.delete();
            }
        }
    }

    // Matrix cases (all through the real /auto-redact controller path)

    @Test
    @DisplayName("standard Helvetica: target gone, neighbours survive")
    void standard14Helvetica() throws IOException {
        byte[] out = autoRedact(helveticaPdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("standard-14 Times and Courier: target gone, neighbours survive")
    void standard14TimesAndCourier() throws IOException {
        for (Standard14Fonts.FontName fn :
                new Standard14Fonts.FontName[] {
                    Standard14Fonts.FontName.TIMES_ROMAN, Standard14Fonts.FontName.COURIER
                }) {
            byte[] pdf = std14Pdf(fn, "alpha SECRET omega");
            byte[] out = autoRedact(pdf, "SECRET");
            assertGone(out, "SECRET");
            assertThat(pdfText(out)).as("%s keeps neighbours", fn).contains("alpha");
        }
    }

    @Test
    @DisplayName("simple TrueType with MacRoman encoding: target gone, neighbours survive")
    void simpleTrueTypeMacRoman() throws IOException {
        byte[] out = autoRedact(macRomanTtfPdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("embedded Type0 with /ToUnicode stripped: target still gone, neighbours survive")
    void type0WithoutToUnicode() throws IOException {
        byte[] out = autoRedact(type0NoToUnicodePdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("subset-tagged font (ABCDEF+): target gone, neighbours survive")
    void subsetTaggedFont() throws IOException {
        byte[] out = autoRedact(subsetTaggedPdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("real Type3 font (glyphs as content streams, no ToUnicode): target gone")
    void type3GlyphProcs() throws IOException {
        // crop_test.pdf uses DejaVuSans embedded as a subset Type3 font with no
        byte[] input;
        try (InputStream in = getClass().getResourceAsStream("/redaction/type3_dejavu.pdf")) {
            input = in.readAllBytes();
        }
        byte[] out = autoRedact(input, "EXAMPLE");
        assertGone(out, "EXAMPLE");
        assertThat(pdfText(out)).contains("CROP");
    }

    @Test
    @DisplayName("embedded subset Type0 (CID) font: target gone, neighbours survive")
    void embeddedSubsetType0() throws IOException {
        byte[] out = autoRedact(type0Pdf(true, "alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("embedded full Type0 (CID) font: target gone, neighbours survive")
    void embeddedFullType0() throws IOException {
        byte[] out = autoRedact(type0Pdf(false, "alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("simple embedded TrueType (WinAnsi) font: target gone, neighbours survive")
    void simpleTrueTypeWinAnsi() throws IOException {
        byte[] out = autoRedact(simpleTtfPdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("rotated pages (90/180/270): target gone on every rotation")
    void rotatedPages() throws IOException {
        for (int rotation : new int[] {90, 180, 270}) {
            byte[] out = autoRedact(rotatedPdf(rotation, "alpha SECRET omega"), "SECRET");
            assertGone(out, "SECRET");
            assertThat(pdfText(out)).as("rotation %d keeps neighbours", rotation).contains("alpha");
        }
    }

    @Test
    @DisplayName("target split across TJ array operands is removed")
    void tjArraySplit() throws IOException {
        byte[] out = autoRedact(tjSplitPdf(), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("public");
    }

    @Test
    @DisplayName("target split across separate Tj operators is removed, other pages keep text")
    void crossOperatorSplit() throws IOException {
        byte[] out = autoRedact(crossOperatorPdf(), "SECRET");
        assertGone(out, "SECRET");
        // Page 2 was never touched; whatever path handled page 1, page 2 text must
        assertThat(pdfText(out)).contains("PUBLIC PAGE TWO");
    }

    @Test
    @DisplayName("target inside a Form XObject is removed")
    void formXObjectText() throws IOException {
        byte[] out = autoRedact(formXObjectPdf(), "SECRET");
        assertGone(out, "SECRET");
    }

    @Test
    @DisplayName("CropBox smaller than MediaBox: target gone, neighbours survive")
    void cropBoxOffset() throws IOException {
        byte[] out = autoRedact(cropBoxPdf("alpha SECRET omega"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("alpha");
    }

    @Test
    @DisplayName("multi-page: target on middle page only, other pages keep their text")
    void multiPageMiddleTarget() throws IOException {
        byte[] out =
                autoRedact(
                        multiPagePdf("PUBLIC ONE", "middle SECRET line", "PUBLIC THREE"), "SECRET");
        assertGone(out, "SECRET");
        assertThat(pdfText(out)).contains("PUBLIC ONE").contains("PUBLIC THREE");
    }

    @Test
    @DisplayName("case variant: doc contains 'Secret', target 'SECRET' removes it")
    void caseVariantRemoved() throws IOException {
        byte[] out = autoRedact(helveticaPdf("alpha Secret omega"), "SECRET");
        assertGone(out, "Secret");
        assertThat(pdfText(out)).contains("alpha").contains("omega");
    }

    @Test
    @DisplayName("whole-word with case variant: 'Cat' removed, substrings survive")
    void wholeWordCaseVariant() throws IOException {
        byte[] bytes = helveticaPdf("Cat classification scatter");
        factoryReturns(bytes);
        RedactPdfRequest request = baseRequest(bytes, "cat");
        request.setWholeWordSearch(true);

        byte[] out = drainBody(controller.redactPdf(request));
        String text = pdfText(out);
        assertThat(text).contains("classification").contains("scatter");
        // The standalone word must be gone in any case variant.
        assertThat(text).doesNotContainPattern("(?i)\\bcat\\b");
    }

    // Page-scoped rasterisation (pipeline-level, deterministic)

    @Test
    @DisplayName("verification leak rasterises only the leaking page, others keep text")
    void leakRasterisesOnlyLeakingPage() throws IOException {
        // Cross-operator split defeats the per-operand literal rewriter
        byte[] input = crossOperatorPdf();
        byte[] out;
        try (PDDocument doc = Loader.loadPDF(input)) {
            Set<String> targets = Set.of("SECRET");
            List<Pattern> patterns =
                    RedactionPipeline.buildPatterns(new String[] {"SECRET"}, false, false);
            RedactionPipeline.redactLiteralTerms(doc, targets, patterns);
            out = RedactionPipeline.finalize(doc, targets, patterns);
        }

        try (PDDocument reopened = Loader.loadPDF(out)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(1);
            String page1 = stripper.getText(reopened);
            stripper.setStartPage(2);
            stripper.setEndPage(2);
            String page2 = stripper.getText(reopened);

            assertThat(page1.toLowerCase()).doesNotContain("secret");
            assertThat(page2).contains("PUBLIC PAGE TWO");
        }
    }

    // Drivers and assertions

    private byte[] autoRedact(byte[] pdfBytes, String target) throws IOException {
        factoryReturns(pdfBytes);
        RedactPdfRequest request = baseRequest(pdfBytes, target);
        ResponseEntity<Resource> response = controller.redactPdf(request);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return drainBody(response);
    }

    private RedactPdfRequest baseRequest(byte[] pdfBytes, String target) {
        RedactPdfRequest request = new RedactPdfRequest();
        request.setFileInput(pdfFile(pdfBytes));
        request.setListOfText(target);
        request.setUseRegex(false);
        request.setWholeWordSearch(false);
        request.setRedactColor("#000000");
        request.setConvertPDFToImage(false);
        return request;
    }

    private void assertGone(byte[] out, String target) throws IOException {
        assertThat(pdfText(out).toLowerCase()).doesNotContain(target.toLowerCase());
    }

    private void factoryReturns(byte[] pdfBytes) throws IOException {
        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));
    }

    private MockMultipartFile pdfFile(byte[] bytes) {
        return new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", bytes);
    }

    private byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private String pdfText(byte[] pdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            return new PDFTextStripper().getText(doc);
        }
    }

    // PDF builders

    private static PDFont helvetica() {
        return new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    }

    private byte[] helveticaPdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            addTextPage(doc, helvetica(), line, 0, null);
            return save(doc);
        }
    }

    private byte[] std14Pdf(Standard14Fonts.FontName fontName, String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            addTextPage(doc, new PDType1Font(fontName), line, 0, null);
            return save(doc);
        }
    }

    private byte[] macRomanTtfPdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDTrueTypeFont.load(doc, ttf, MacRomanEncoding.INSTANCE);
            }
            addTextPage(doc, font, line, 0, null);
            return save(doc);
        }
    }

    private byte[] type0NoToUnicodePdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, true);
            }
            addTextPage(doc, font, line, 0, null);
            font.getCOSObject().removeItem(org.apache.pdfbox.cos.COSName.TO_UNICODE);
            return save(doc);
        }
    }

    private byte[] subsetTaggedPdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, true);
            }
            addTextPage(doc, font, line, 0, null);
            String tagged = "ABCDEF+" + font.getName();
            font.getCOSObject().setName(org.apache.pdfbox.cos.COSName.BASE_FONT, tagged);
            if (font.getFontDescriptor() != null) {
                font.getFontDescriptor()
                        .getCOSObject()
                        .setName(org.apache.pdfbox.cos.COSName.FONT_NAME, tagged);
            }
            return save(doc);
        }
    }

    private byte[] type0Pdf(boolean subset, String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, subset);
            }
            addTextPage(doc, font, line, 0, null);
            return save(doc);
        }
    }

    private byte[] simpleTtfPdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont font;
            try (InputStream ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
            }
            addTextPage(doc, font, line, 0, null);
            return save(doc);
        }
    }

    private byte[] rotatedPdf(int rotation, String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            addTextPage(doc, helvetica(), line, rotation, null);
            return save(doc);
        }
    }

    private byte[] cropBoxPdf(String line) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            addTextPage(doc, helvetica(), line, 0, new PDRectangle(40, 40, 500, 700));
            return save(doc);
        }
    }

    private byte[] multiPagePdf(String... pageLines) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (String line : pageLines) {
                addTextPage(doc, helvetica(), line, 0, null);
            }
            return save(doc);
        }
    }

    /** One page whose text is emitted as a TJ array: ["public ", "SEC", -20 */
    private byte[] tjSplitPdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(helvetica(), FONT_SIZE);
                cs.newLineAtOffset(LEFT_X, TOP_Y);
                cs.showTextWithPositioning(
                        new Object[] {"public ", "SEC", Float.valueOf(-20f), "RET", " end"});
                cs.endText();
            }
            return save(doc);
        }
    }

    /** Page 1 shows "SEC" and "RET" as separate adjacent Tj operators; page 2 */
    private byte[] crossOperatorPdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            PDFont font = helvetica();
            float secWidth = font.getStringWidth("SEC") / 1000f * FONT_SIZE;
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, FONT_SIZE);
                cs.newLineAtOffset(LEFT_X, TOP_Y);
                cs.showText("SEC");
                cs.endText();
                cs.beginText();
                cs.setFont(font, FONT_SIZE);
                cs.newLineAtOffset(LEFT_X + secWidth, TOP_Y);
                cs.showText("RET");
                cs.endText();
            }
            addTextPage(doc, helvetica(), "PUBLIC PAGE TWO", 0, null);
            return save(doc);
        }
    }

    private byte[] formXObjectPdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);

            PDFormXObject form = new PDFormXObject(doc);
            form.setBBox(new PDRectangle(0, 0, 400, 60));
            form.setResources(new PDResources());
            try (PDFormContentStream fcs = new PDFormContentStream(form)) {
                fcs.beginText();
                fcs.setFont(helvetica(), FONT_SIZE);
                fcs.newLineAtOffset(10, 20);
                fcs.showText("xobj SECRET payload");
                fcs.endText();
            }

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.saveGraphicsState();
                cs.transform(Matrix.getTranslateInstance(LEFT_X, TOP_Y - 60));
                cs.drawForm(form);
                cs.restoreGraphicsState();
            }
            return save(doc);
        }
    }

    private void addTextPage(
            PDDocument doc, PDFont font, String line, int rotation, PDRectangle cropBox)
            throws IOException {
        PDPage page = new PDPage(PDRectangle.LETTER);
        if (rotation != 0) {
            page.setRotation(rotation);
        }
        if (cropBox != null) {
            page.setCropBox(cropBox);
        }
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(font, FONT_SIZE);
            if (rotation != 0) {
                // Real generators compensate the text matrix so text reads upright
                cs.setTextMatrix(
                        Matrix.getRotateInstance(
                                Math.toRadians(rotation),
                                PDRectangle.LETTER.getWidth() / 2,
                                PDRectangle.LETTER.getHeight() / 2));
            } else {
                cs.newLineAtOffset(LEFT_X, TOP_Y);
            }
            cs.showText(line);
            cs.endText();
        }
    }

    private static byte[] save(PDDocument doc) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }
}
