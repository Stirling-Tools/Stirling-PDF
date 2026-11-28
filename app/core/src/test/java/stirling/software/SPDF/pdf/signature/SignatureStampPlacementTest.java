package stirling.software.SPDF.pdf.signature;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SignatureStampPlacementTest {

    private static final PDRectangle LETTER = new PDRectangle(0, 0, 612, 792);

    @Test
    void noBoxAndNoFieldMeansNoPlacementInput() {
        assertNull(SignatureStampPlacement.Box.of(null, null, null, null));
    }

    @Test
    void aPartialBoxIsRejected() {
        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> SignatureStampPlacement.Box.of(10f, 10f, null, 50f));
        assertTrue(error.getMessage().contains("all four"), error.getMessage());
    }

    @ParameterizedTest
    @CsvSource({"0,50", "200,0", "-5,50", "200,-1"})
    void aBoxWithoutPositiveSizeIsRejected(float width, float height) {
        assertThrows(
                IllegalArgumentException.class,
                () -> SignatureStampPlacement.Box.of(10f, 10f, width, height));
    }

    @Test
    void aNonFiniteCoordinateIsRejected() {
        assertThrows(
                IllegalArgumentException.class,
                () -> SignatureStampPlacement.Box.of(Float.NaN, 10f, 100f, 50f));
    }

    @Test
    void theDefaultBoxSitsInsetFromTheBottomRightCorner() {
        PDRectangle rect = SignatureStampPlacement.defaultRectangle(LETTER, 0);
        assertRect(rect, 612 - 36 - 200, 36, 200, 50);
    }

    @Test
    void theDefaultBoxFollowsTheCropBoxOffset() {
        PDRectangle crop = new PDRectangle(100, 200, 400, 300);
        PDRectangle rect = SignatureStampPlacement.defaultRectangle(crop, 0);
        assertRect(rect, 500 - 36 - 200, 236, 200, 50);
    }

    @Test
    void theDefaultBoxShrinksToFitATinyPage() {
        PDRectangle rect =
                SignatureStampPlacement.defaultRectangle(new PDRectangle(0, 0, 100, 40), 0);
        assertRect(rect, 0, 0, 100, 40);
    }

    @ParameterizedTest
    @CsvSource({
        // rotation, then the user-space box that shows at the visible bottom-right corner
        "90, 526, 556, 50, 200",
        "180, 36, 706, 200, 50",
        "270, 36, 36, 50, 200"
    })
    void theDefaultBoxIsAtTheBottomRightOfTheRotatedPage(
            int rotation, float x, float y, float width, float height) {
        assertRect(SignatureStampPlacement.defaultRectangle(LETTER, rotation), x, y, width, height);
    }

    @ParameterizedTest
    @CsvSource({
        // rotation, visible box (x, y, w, h), expected user-space box (x, y, w, h)
        "0, 10, 20, 100, 30, 110, 220, 100, 30",
        "90, 10, 20, 100, 30, 450, 210, 30, 100",
        "180, 10, 20, 100, 30, 390, 450, 100, 30",
        "270, 10, 20, 100, 30, 120, 390, 30, 100"
    })
    void visibleBoxesMapIntoUserSpace(
            int rotation,
            float vx,
            float vy,
            float vw,
            float vh,
            float x,
            float y,
            float width,
            float height) {
        PDRectangle crop = new PDRectangle(100, 200, 400, 300);
        assertRect(
                SignatureStampPlacement.toUserSpace(crop, rotation, vx, vy, vw, vh),
                x,
                y,
                width,
                height);
    }

    @Test
    void anExplicitBoxIsKeptInUserSpace() throws Exception {
        try (PDDocument doc = pageWith(new PDRectangle(50, 60, 500, 700), 90)) {
            SignatureStampPlacement placement =
                    SignatureStampPlacement.resolve(
                            doc, 0, SignatureStampPlacement.Box.of(100f, 200f, 50f, 150f), null);

            assertEquals(0, placement.pageIndex());
            assertEquals(90, placement.rotation());
            assertRect(placement.rectangle(), 100, 200, 50, 150);
            assertEquals(150, placement.visibleWidth());
            assertEquals(50, placement.visibleHeight());
        }
    }

    @Test
    void aBoxOutsideTheCropBoxIsRejectedEvenWhenInsideTheMediaBox() throws Exception {
        try (PDDocument doc = pageWith(new PDRectangle(50, 60, 500, 700), 0)) {
            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () ->
                                    SignatureStampPlacement.resolve(
                                            doc,
                                            0,
                                            SignatureStampPlacement.Box.of(10f, 100f, 50f, 50f),
                                            null));
            assertTrue(error.getMessage().contains("outside page 1"), error.getMessage());
        }
    }

    @Test
    void aBoxFlushWithTheCropBoxEdgeIsAccepted() throws Exception {
        try (PDDocument doc = pageWith(new PDRectangle(50, 60, 500, 700), 0)) {
            SignatureStampPlacement placement =
                    SignatureStampPlacement.resolve(
                            doc, 0, SignatureStampPlacement.Box.of(50f, 60.2f, 500.3f, 100f), null);
            assertEquals(50, placement.rectangle().getLowerLeftX());
        }
    }

    @Test
    void aBoxWithinTheEdgeToleranceButNoVisibleAreaIsRejected() throws Exception {
        try (PDDocument doc = pageWith(new PDRectangle(50, 60, 500, 700), 0)) {
            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () ->
                                    SignatureStampPlacement.resolve(
                                            doc,
                                            0,
                                            SignatureStampPlacement.Box.of(49.6f, 100f, 0.2f, 50f),
                                            null));
            assertTrue(error.getMessage().contains("no visible area"), error.getMessage());
        }
    }

    @Test
    void aBoxWhoseWidthRoundsToNothingIsRejected() throws Exception {
        try (PDDocument doc = pageWith(LETTER, 0)) {
            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            SignatureStampPlacement.resolve(
                                    doc,
                                    0,
                                    SignatureStampPlacement.Box.of(100f, 100f, 0.000001f, 50f),
                                    null));
        }
    }

    @Test
    void aFieldOutsideTheVisiblePageIsRejected() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            page.setCropBox(new PDRectangle(100, 100, 400, 500));
            doc.addPage(page);
            addSignatureField(doc, page, "Hidden", new PDRectangle(10, 10, 70, 30));

            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> SignatureStampPlacement.resolve(doc, 0, null, "Hidden"));
            assertTrue(error.getMessage().contains("outside the visible page"), error.getMessage());
        }
    }

    @Test
    void aMissingPageIsRejected() throws Exception {
        try (PDDocument doc = pageWith(LETTER, 0)) {
            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> SignatureStampPlacement.resolve(doc, 3, null, null));
            assertTrue(error.getMessage().contains("pageNumber 4"), error.getMessage());
        }
    }

    @Test
    void anEmptyFieldGivesItsOwnPageAndBox() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.LETTER));
            PDPage second = new PDPage(PDRectangle.LETTER);
            second.setRotation(270);
            doc.addPage(second);
            PDSignatureField field =
                    addSignatureField(doc, second, "Approver", new PDRectangle(300, 400, 80, 40));

            SignatureStampPlacement placement =
                    SignatureStampPlacement.resolve(doc, 0, null, "Approver");

            assertEquals(1, placement.pageIndex());
            assertEquals(270, placement.rotation());
            assertSame(field.getCOSObject(), placement.field().getCOSObject());
            assertRect(placement.rectangle(), 300, 400, 80, 40);
        }
    }

    @Test
    void aFieldWithoutAPageLinkIsFoundThroughThePageAnnotations() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            PDSignatureField field =
                    addSignatureField(doc, page, "Sig", new PDRectangle(10, 10, 80, 40));
            field.getWidgets().getFirst().setPage(null);

            assertEquals(0, SignatureStampPlacement.resolve(doc, null, null, "Sig").pageIndex());
        }
    }

    @Test
    void aFieldThatDoesNotExistIsRejected() throws Exception {
        try (PDDocument doc = pageWith(LETTER, 0)) {
            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> SignatureStampPlacement.resolve(doc, 0, null, "Nope"));
            assertTrue(error.getMessage().contains("no signature field"), error.getMessage());
        }
    }

    @Test
    void aSignedFieldIsRejected() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            PDSignatureField field =
                    addSignatureField(doc, page, "Done", new PDRectangle(10, 10, 80, 40));
            field.getCOSObject()
                    .setItem(org.apache.pdfbox.cos.COSName.V, new PDSignature().getCOSObject());

            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> SignatureStampPlacement.resolve(doc, 0, null, "Done"));
            assertTrue(error.getMessage().contains("already signed"), error.getMessage());
        }
    }

    @Test
    void anInvisibleFieldIsRejected() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            addSignatureField(doc, page, "Hidden", new PDRectangle(0, 0, 0, 0));

            IllegalArgumentException error =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> SignatureStampPlacement.resolve(doc, 0, null, "Hidden"));
            assertTrue(error.getMessage().contains("no box"), error.getMessage());
        }
    }

    @Test
    void aFieldAndABoxTogetherAreRejected() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            addSignatureField(doc, page, "Sig", new PDRectangle(10, 10, 80, 40));

            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            SignatureStampPlacement.resolve(
                                    doc,
                                    0,
                                    SignatureStampPlacement.Box.of(10f, 10f, 80f, 40f),
                                    "Sig"));
        }
    }

    static PDSignatureField addSignatureField(
            PDDocument doc, PDPage page, String name, PDRectangle rect) throws Exception {
        PDAcroForm form = doc.getDocumentCatalog().getAcroForm(null);
        if (form == null) {
            form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
        }
        PDSignatureField field = new PDSignatureField(form);
        field.setPartialName(name);
        PDAnnotationWidget widget = field.getWidgets().getFirst();
        widget.setRectangle(rect);
        widget.setPage(page);
        page.getAnnotations().add(widget);
        form.getFields().add(field);
        return field;
    }

    private static PDDocument pageWith(PDRectangle cropBox, int rotation) {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        page.setCropBox(cropBox);
        page.setRotation(rotation);
        doc.addPage(page);
        return doc;
    }

    private static void assertRect(PDRectangle rect, float x, float y, float width, float height) {
        assertEquals(x, rect.getLowerLeftX(), 0.01, "x");
        assertEquals(y, rect.getLowerLeftY(), 0.01, "y");
        assertEquals(width, rect.getWidth(), 0.01, "width");
        assertEquals(height, rect.getHeight(), 0.01, "height");
    }
}
