package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

/**
 * Option captions belong to the viewer, not the page. Drawing them into the content stream left
 * orphan text behind on every move and delete, so these pin the page staying clean.
 */
class FormUtilsRadioCaptionTest {

    private static FormUtils.NewFormFieldDefinition newField(
            String type, String name, float x, float y, float w, float h, List<String> options) {
        return new FormUtils.NewFormFieldDefinition(
                name, null, type, 0, x, y, w, h, null, null, options, null, null, null, null, null,
                null, null);
    }

    private static byte[] save(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }

    private static PDDocument blankWithForm() {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(PDRectangle.LETTER));
        document.getDocumentCatalog().setAcroForm(new PDAcroForm(document));
        return document;
    }

    private static String textOf(byte[] pdf) throws IOException {
        try (PDDocument reloaded = Loader.loadPDF(pdf)) {
            return new PDFTextStripper().getText(reloaded);
        }
    }

    @Test
    void radioOptionsAreNotBakedIntoThePage() throws IOException {
        byte[] saved;
        try (PDDocument document = blankWithForm()) {
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField(
                                    "radio",
                                    "contact",
                                    72,
                                    600,
                                    12,
                                    12,
                                    List.of("Email", "Telephone", "Post"))));
            saved = save(document);
        }

        // The caption is the viewer's job; page content cannot follow a widget that moves.
        String text = textOf(saved);
        assertFalse(text.contains("Email"), "options must not be page content: " + text);
        assertFalse(text.contains("Telephone"), "options must not be page content: " + text);
        assertFalse(text.contains("Post"), "options must not be page content: " + text);
    }

    @Test
    void captionsDoNotReplaceTheWidgetsThemselves() throws IOException {
        byte[] saved;
        try (PDDocument document = blankWithForm()) {
            FormUtils.addNewFields(
                    document,
                    List.of(newField("radio", "size", 72, 600, 12, 12, List.of("S", "M", "L"))));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDRadioButton radio = (PDRadioButton) acroForm.getField("size");
            assertEquals(3, radio.getWidgets().size(), "one widget per option");
            assertFalse(radio.getExportValues().isEmpty(), "export values must survive");
        }
    }

    @Test
    void aTextFieldDrawsNoStrayCaption() throws IOException {
        // Control: proves the assertions above read the captions and not some unrelated content.
        byte[] saved;
        try (PDDocument document = blankWithForm()) {
            FormUtils.addNewFields(
                    document, List.of(newField("text", "fullName", 72, 600, 200, 18, null)));
            saved = save(document);
        }
        assertTrue(textOf(saved).isBlank(), "a text field should add no page content");
    }

    @Test
    void deletingARadioGroupTakesItsCaptionsWithIt() throws IOException {
        byte[] withRadio;
        try (PDDocument document = blankWithForm()) {
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField(
                                    "radio",
                                    "contact",
                                    72,
                                    600,
                                    12,
                                    12,
                                    List.of("Email", "Telephone", "Post"))));
            withRadio = save(document);
        }
        assertFalse(
                textOf(withRadio).contains("Telephone"),
                "the group adds no page text to begin with");

        byte[] afterDelete;
        try (PDDocument document = Loader.loadPDF(withRadio)) {
            FormUtils.applyFieldEdits(document, List.of(), List.of(), List.of("contact"));
            afterDelete = save(document);
        }

        String text = textOf(afterDelete);
        assertFalse(
                text.contains("Telephone"),
                "a deleted radio group must not leave its captions on the page: " + text);
    }

    @Test
    void theDrawnBoxIsTheWholeGroupNotOneOption() {
        // A 90pt box used to become a 360pt stack because each option got the full height.
        PDRectangle box = new PDRectangle(72f, 500f, 100f, 90f);
        var rects = FormUtils.radioOptionRects(box, 3, null, null);

        assertEquals(3, rects.size());
        float top = rects.get(0).getUpperRightY();
        float bottom = rects.get(2).getLowerLeftY();
        assertEquals(90f, top - bottom, 0.01f, "the group must fill exactly the drawn height");
        assertEquals(
                box.getUpperRightY(), top, 0.01f, "the first option starts at the box's top edge");
        for (PDRectangle r : rects) {
            assertEquals(r.getWidth(), r.getHeight(), 0.01f, "options stay square");
            assertTrue(r.getWidth() <= box.getWidth() + 0.01f, "an option never exceeds the box");
        }
    }

    @Test
    void explicitSizeAndGapWin() {
        PDRectangle box = new PDRectangle(0f, 0f, 100f, 90f);
        var rects = FormUtils.radioOptionRects(box, 3, 20f, 14f);
        for (PDRectangle r : rects) {
            assertEquals(14f, r.getHeight(), 0.01f, "the requested size is used verbatim");
        }
        float gap = rects.get(0).getLowerLeftY() - rects.get(1).getUpperRightY();
        assertEquals(20f, gap, 0.01f, "the requested gap is used verbatim");
    }

    @Test
    void aSingleOptionStillFitsTheBox() {
        var rects = FormUtils.radioOptionRects(new PDRectangle(0f, 0f, 40f, 40f), 1, null, null);
        assertEquals(1, rects.size());
        assertTrue(rects.get(0).getHeight() <= 40f, "one option cannot exceed its box");
    }
}
