package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.FormUtils.NewFormFieldDefinition;

class FormUtilsAddFieldsTest {

    private NewFormFieldDefinition def(String type, int page, float x, float y, float w, float h) {
        return new NewFormFieldDefinition(
                null, null, type, page, x, y, w, h, false, null, null, null, null);
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
}
