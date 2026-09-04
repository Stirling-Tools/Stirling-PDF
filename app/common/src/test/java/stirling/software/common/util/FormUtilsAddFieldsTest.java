package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.FormUtils.NewFormFieldDefinition;

class FormUtilsAddFieldsTest {

    private NewFormFieldDefinition def(String type, int page, float x, float y, float w, float h) {
        // name, label, type, pageIndex, x, y, width, height, required, multiSelect,
        // options, defaultValue, tooltip, fontSize, readOnly, multiline, maxLength, buttonAction
        return new NewFormFieldDefinition(
                null, null, type, page, x, y, w, h, false, null, null, null, null, null, null, null,
                null, null);
    }

    @Test
    void createsTextAndCheckboxFieldsOnPagelessDocument() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));

            FormUtils.addFields(
                    doc,
                    List.of(
                            def("text", 0, 100f, 700f, 200f, 20f),
                            def("checkbox", 0, 100f, 650f, 15f, 15f)));

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            assertNotNull(form, "AcroForm should be created");

            List<PDField> fields = new ArrayList<>();
            form.getFieldTree().forEach(fields::add);
            assertEquals(2, fields.size());

            boolean hasText = fields.stream().anyMatch(f -> f instanceof PDTextField);
            boolean hasCheckbox = fields.stream().anyMatch(f -> f instanceof PDCheckBox);
            assertTrue(hasText, "expected a text field");
            assertTrue(hasCheckbox, "expected a checkbox field");
        }
    }

    @Test
    void skipsOutOfRangePageAndKeepsNamesUnique() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));

            FormUtils.addFields(
                    doc,
                    List.of(
                            def("text", 0, 10f, 10f, 50f, 12f),
                            def("text", 0, 10f, 40f, 50f, 12f),
                            def("text", 5, 10f, 70f, 50f, 12f))); // page 5 out of range -> skipped

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            List<PDField> fields = new ArrayList<>();
            form.getFieldTree().forEach(fields::add);
            assertEquals(2, fields.size());

            long distinctNames = fields.stream().map(PDField::getPartialName).distinct().count();
            assertEquals(2, distinctNames, "field names must be unique");
        }
    }

    @Test
    void noOpOnEmptyDefinitions() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));
            FormUtils.addFields(doc, List.of());
            // no AcroForm forced into existence when there is nothing to add
            assertEquals(null, doc.getDocumentCatalog().getAcroForm());
        }
    }

    @Test
    void skipsZeroAreaRectsInsteadOfInventingDefaults() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));

            FormUtils.addFields(
                    doc,
                    List.of(
                            def("text", 0, 100f, 700f, 200f, 20f),
                            def("text", 0, 100f, 650f, 0f, 20f), // zero width -> skipped
                            def("text", 0, 100f, 600f, 50f, 0f))); // zero height -> skipped

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            List<PDField> fields = new ArrayList<>();
            form.getFieldTree().forEach(fields::add);
            assertEquals(1, fields.size(), "degenerate rects must not become fields");
        }
    }

    @Test
    void signatureDetectionsBecomeFillableTextFields() throws IOException {
        // Parity contract with the browser engine: pdf-lib cannot create signature widgets, so
        // both paths deliberately emit a text field for detected signature areas.
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));

            FormUtils.addFields(doc, List.of(def("signature", 0, 100f, 200f, 220f, 48f)));

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            List<PDField> fields = new ArrayList<>();
            form.getFieldTree().forEach(fields::add);
            assertEquals(1, fields.size());
            assertTrue(
                    fields.get(0) instanceof PDTextField,
                    "signature areas are written as fillable text fields");
        }
    }

    @Test
    void checkboxFieldsGetVisibleAppearanceStreams() throws IOException {
        // refreshAppearances() never builds /AP for the button family, so addFields must draw
        // them itself; without that a detected checkbox is silently invisible in viewers.
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));

            FormUtils.addFields(doc, List.of(def("checkbox", 0, 100f, 650f, 15f, 15f)));

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            PDCheckBox checkbox = (PDCheckBox) form.getFieldTree().iterator().next();
            PDAnnotationWidget widget = checkbox.getWidgets().get(0);

            PDAppearanceDictionary appearance = widget.getAppearance();
            assertNotNull(appearance, "checkbox widget must carry an appearance dictionary");
            PDAppearanceEntry normal = appearance.getNormalAppearance();
            assertNotNull(normal, "checkbox needs a normal appearance");
            assertTrue(normal.isSubDictionary(), "checkbox /AP /N holds per-state streams");
            boolean hasOnState =
                    normal.getSubDictionary().keySet().stream()
                            .anyMatch(name -> !COSName.Off.equals(name));
            assertTrue(hasOnState, "an on-state appearance stream must exist");

            String onValue = checkbox.getOnValue();
            assertTrue(
                    onValue != null && !onValue.isBlank() && !"Off".equals(onValue),
                    "PDFBox reads the on-state from /AP /N; got '" + onValue + "'");
        }
    }

    @Test
    void addingFieldsKeepsExistingFieldAppearanceStreamsUntouched() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(new PDRectangle(612, 792)));
            FormUtils.addFields(doc, List.of(def("text", 0, 100f, 700f, 200f, 20f)));

            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            PDTextField existing = (PDTextField) form.getFieldTree().iterator().next();
            existing.setValue("existing value");
            var normalBefore =
                    existing.getWidgets().get(0).getNormalAppearanceStream().getCOSObject();
            assertNotNull(normalBefore, "setting a value generates an appearance");

            FormUtils.addFields(doc, List.of(def("text", 0, 100f, 650f, 200f, 20f)));

            var normalAfter =
                    existing.getWidgets().get(0).getNormalAppearanceStream().getCOSObject();
            assertTrue(
                    normalBefore == normalAfter,
                    "pre-existing field appearances must not be regenerated");
        }
    }
}
