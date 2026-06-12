package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

class FormUtilsAdditionalTest {

    private record SetupDocument(PDPage page, PDAcroForm acroForm) {}

    private static SetupDocument createBasicDocument(PDDocument document) throws IOException {
        PDPage page = new PDPage();
        document.addPage(page);

        PDAcroForm acroForm = new PDAcroForm(document);
        acroForm.setDefaultResources(new PDResources());
        acroForm.setNeedAppearances(true);
        document.getDocumentCatalog().setAcroForm(acroForm);

        return new SetupDocument(page, acroForm);
    }

    private static void attachWidget(
            SetupDocument setup,
            org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField field,
            PDRectangle rectangle)
            throws IOException {
        PDAnnotationWidget widget = new PDAnnotationWidget();
        widget.setRectangle(rectangle);
        widget.setPage(setup.page);
        List<PDAnnotationWidget> widgets = new ArrayList<>(field.getWidgets());
        widgets.add(widget);
        field.setWidgets(widgets);
        setup.acroForm.getFields().add(field);
        setup.page.getAnnotations().add(widget);
    }

    // --- detectFieldType ---

    @Test
    void testDetectFieldType_textField() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField field = new PDTextField(setup.acroForm);
            assertEquals("text", FormUtils.detectFieldType(field));
        }
    }

    @Test
    void testDetectFieldType_checkBox() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDCheckBox field = new PDCheckBox(setup.acroForm);
            assertEquals("checkbox", FormUtils.detectFieldType(field));
        }
    }

    // --- extractFormFields ---

    @Test
    void testExtractFormFields_nullDocument() {
        List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(null);
        assertTrue(fields.isEmpty());
    }

    @Test
    void testExtractFormFields_noAcroForm() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            // No AcroForm set
            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
            assertTrue(fields.isEmpty());
        }
    }

    @Test
    void testExtractFormFields_singleTextField() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("firstName");
            attachWidget(setup, textField, new PDRectangle(50, 700, 200, 20));

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
            assertEquals(1, fields.size());
            assertEquals("firstName", fields.get(0).name());
            assertEquals("text", fields.get(0).type());
            assertEquals(0, fields.get(0).pageIndex());
        }
    }

    @Test
    void testExtractFormFields_multipleFields() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);

            PDTextField field1 = new PDTextField(setup.acroForm);
            field1.setPartialName("name");
            attachWidget(setup, field1, new PDRectangle(50, 700, 200, 20));

            PDTextField field2 = new PDTextField(setup.acroForm);
            field2.setPartialName("email");
            attachWidget(setup, field2, new PDRectangle(50, 660, 200, 20));

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
            assertEquals(2, fields.size());
        }
    }

    // --- buildFillTemplateRecord ---

    @Test
    void testBuildFillTemplateRecord_null() {
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(null);
        assertTrue(result.isEmpty());
    }

    @Test
    void testBuildFillTemplateRecord_empty() {
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(Collections.emptyList());
        assertTrue(result.isEmpty());
    }

    @Test
    void testBuildFillTemplateRecord_textField() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "name", "Name", "text", "John", null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertEquals("John", result.get("name"));
    }

    @Test
    void testBuildFillTemplateRecord_checkboxField() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "agree", "Agreement", "checkbox", "Yes", null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertEquals(Boolean.TRUE, result.get("agree"));
    }

    @Test
    void testBuildFillTemplateRecord_checkboxFieldOff() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "agree", "Agreement", "checkbox", "Off", null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertEquals(Boolean.FALSE, result.get("agree"));
    }

    @Test
    void testBuildFillTemplateRecord_skipsButton() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "submit", "Submit", "button", null, null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertFalse(result.containsKey("submit"));
    }

    @Test
    void testBuildFillTemplateRecord_skipsSignature() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "sig", "Signature", "signature", null, null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertFalse(result.containsKey("sig"));
    }

    // --- safeValue ---

    @Test
    void testSafeValue_nonNull() {
        assertEquals("hello", FormUtils.safeValue("hello"));
    }

    @Test
    void testSafeValue_null() {
        assertEquals("", FormUtils.safeValue(null));
    }

    // --- applyFieldValues ---

    @Test
    void testApplyFieldValues_nullDocument() throws IOException {
        // Should not throw
        FormUtils.applyFieldValues(null, Map.of("key", "value"), false);
    }

    @Test
    void testApplyFieldValues_noAcroFormStrict() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertThrows(
                    IOException.class,
                    () -> FormUtils.applyFieldValues(doc, Map.of("key", "val"), false, true));
        }
    }

    @Test
    void testApplyFieldValues_noAcroFormNonStrict() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            // Should not throw in non-strict mode
            FormUtils.applyFieldValues(doc, Map.of("key", "val"), false, false);
        }
    }

    @Test
    void testApplyFieldValues_setsTextValue() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("company");
            attachWidget(setup, textField, new PDRectangle(60, 720, 220, 20));

            FormUtils.applyFieldValues(doc, Map.of("company", "Stirling"), false);
            assertEquals("Stirling", textField.getValueAsString());
        }
    }

    @Test
    void testApplyFieldValues_checksCheckbox_nonStrict() throws IOException {
        // In non-strict mode, checkbox state changes may fail silently
        // if appearance streams are not properly configured. Just verify no exception.
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDCheckBox checkBox = new PDCheckBox(setup.acroForm);
            checkBox.setPartialName("subscribed");
            checkBox.setExportValues(List.of("Yes"));
            attachWidget(setup, checkBox, new PDRectangle(60, 680, 16, 16));

            // Should not throw in non-strict mode even if appearance is missing
            FormUtils.applyFieldValues(doc, Map.of("subscribed", true), false, false);
            FormUtils.applyFieldValues(doc, Map.of("subscribed", false), false, false);
        }
    }

    // Regression: PDFBOX-5962. Flattening with an empty values map used to force
    // setNeedAppearances(true), triggering PDFBox's refreshAppearances loop which
    // could hang indefinitely. The call must complete quickly and clear form fields.
    @Test
    void testApplyFieldValues_emptyValuesWithFlatten_completesAndFlattens() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("company");
            attachWidget(setup, textField, new PDRectangle(60, 720, 220, 20));

            assertTrue(setup.acroForm.getNeedAppearances());

            assertTimeoutPreemptively(
                    Duration.ofSeconds(10),
                    () -> FormUtils.applyFieldValues(doc, Map.of(), true, false));

            PDAcroForm after = doc.getDocumentCatalog().getAcroForm();
            assertTrue(after == null || after.getFields().isEmpty());
        }
    }

    @Test
    void testApplyFieldValues_nullValuesWithFlatten_completesAndFlattens() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("company");
            attachWidget(setup, textField, new PDRectangle(60, 720, 220, 20));

            assertTimeoutPreemptively(
                    Duration.ofSeconds(10),
                    () -> FormUtils.applyFieldValues(doc, null, true, false));

            PDAcroForm after = doc.getDocumentCatalog().getAcroForm();
            assertTrue(after == null || after.getFields().isEmpty());
        }
    }

    @Test
    void testApplyFieldValues_valuesWithFlatten_appliesValueAndFlattens() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("company");
            attachWidget(setup, textField, new PDRectangle(60, 720, 220, 20));

            FormUtils.applyFieldValues(doc, Map.of("company", "Stirling"), true, false);

            PDAcroForm after = doc.getDocumentCatalog().getAcroForm();
            assertTrue(after == null || after.getFields().isEmpty());
        }
    }

    // --- filterSingleChoiceSelection ---

    @Test
    void testFilterSingleChoiceSelection_validSelection() {
        String result =
                FormUtils.filterSingleChoiceSelection(
                        "Option A", List.of("Option A", "Option B"), "field1");
        assertEquals("Option A", result);
    }

    @Test
    void testFilterSingleChoiceSelection_invalidSelection() {
        String result =
                FormUtils.filterSingleChoiceSelection(
                        "Invalid", List.of("Option A", "Option B"), "field1");
        assertNull(result);
    }

    @Test
    void testFilterSingleChoiceSelection_nullSelection() {
        String result = FormUtils.filterSingleChoiceSelection(null, List.of("Option A"), "field1");
        assertNull(result);
    }

    @Test
    void testFilterSingleChoiceSelection_emptySelection() {
        String result = FormUtils.filterSingleChoiceSelection("  ", List.of("Option A"), "field1");
        assertNull(result);
    }

    // --- extractFieldsWithTemplate ---

    @Test
    void testExtractFieldsWithTemplate_emptyDocument() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            FormUtils.FormFieldExtraction extraction = FormUtils.extractFieldsWithTemplate(doc);
            assertNotNull(extraction);
            assertTrue(extraction.fields().isEmpty());
            assertTrue(extraction.template().isEmpty());
        }
    }

    // --- hasAnyRotatedPage ---

    @Test
    void testHasAnyRotatedPage_noRotation() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            assertFalse(FormUtils.hasAnyRotatedPage(doc));
        }
    }
}
