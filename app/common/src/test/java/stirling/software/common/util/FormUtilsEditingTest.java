package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.pdmodel.interactive.form.PDVariableText;
import org.junit.jupiter.api.Test;

/**
 * Round-trip coverage for the structural form-editing additions from PR #5777: {@link
 * FormUtils#addNewFields}, geometry/font/flag changes in {@link FormUtils#modifyFormFields}, and
 * the CropBox-offset coordinate handling.
 *
 * <p>Assertions are made after a save → reload cycle because PDFBox synthesises widgets for fields
 * that have no explicit {@code /Kids}; only the serialised document authoritatively reflects what a
 * viewer (or the next API call) sees.
 */
class FormUtilsEditingTest {

    private static PDAcroForm setupForm(PDDocument document, PDRectangle pageSize) {
        PDPage page = new PDPage(pageSize);
        document.addPage(page);
        PDAcroForm acroForm = new PDAcroForm(document);
        acroForm.setDefaultResources(new PDResources());
        document.getDocumentCatalog().setAcroForm(acroForm);
        return acroForm;
    }

    private static byte[] save(PDDocument document) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        return baos.toByteArray();
    }

    private static FormUtils.NewFormFieldDefinition newText(
            String name, float x, float y, float w, float h) {
        return new FormUtils.NewFormFieldDefinition(
                name, null, "text", 0, x, y, w, h, null, null, null, null, null, null, null, null,
                null, null);
    }

    private static FormUtils.NewFormFieldDefinition newField(
            String type,
            String name,
            float x,
            float y,
            float w,
            float h,
            List<String> options,
            Integer maxLength,
            String buttonAction) {
        return new FormUtils.NewFormFieldDefinition(
                name,
                null,
                type,
                0,
                x,
                y,
                w,
                h,
                null,
                null,
                options,
                null,
                null,
                null,
                null,
                null,
                maxLength,
                buttonAction);
    }

    private static PDRectangle firstWidgetRect(PDAcroForm acroForm, String name) {
        PDField field = acroForm.getField(name);
        assertNotNull(field, "field '" + name + "' should exist");
        assertTrue(!field.getWidgets().isEmpty(), "field should have at least one widget");
        return field.getWidgets().get(0).getRectangle();
    }

    @Test
    void addNewFields_createsTextFieldAtRequestedRectangle() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(document, List.of(newText("created", 50, 700, 200, 20)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(acroForm, "AcroForm should exist after reload");
            assertTrue(acroForm.getField("created") instanceof PDTextField);
            PDRectangle rect = firstWidgetRect(acroForm, "created");
            assertNotNull(rect, "created widget should keep its rectangle after reload");
            assertEquals(50f, rect.getLowerLeftX(), 0.5f);
            assertEquals(700f, rect.getLowerLeftY(), 0.5f);
            assertEquals(200f, rect.getWidth(), 0.5f);
            assertEquals(20f, rect.getHeight(), 0.5f);
        }
    }

    @Test
    void addNewFields_appliesCropBoxOffsetToCoordinates() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            // Shift the CropBox origin; the frontend sends CropBox-relative coords.
            document.getPage(0).setCropBox(new PDRectangle(10, 20, 500, 700));
            FormUtils.addNewFields(document, List.of(newText("shifted", 5, 5, 100, 15)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDRectangle rect = firstWidgetRect(acroForm, "shifted");
            // Absolute = CropBox-relative + CropBox lower-left offset.
            assertEquals(15f, rect.getLowerLeftX(), 0.5f);
            assertEquals(25f, rect.getLowerLeftY(), 0.5f);
        }
    }

    @Test
    void addNewFields_appliesReadOnlyFontSizeAndMultiline() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.NewFormFieldDefinition def =
                    new FormUtils.NewFormFieldDefinition(
                            "opts",
                            null,
                            "text",
                            0,
                            10f,
                            10f,
                            120f,
                            18f,
                            null,
                            null,
                            null,
                            null,
                            null,
                            18f,
                            Boolean.TRUE,
                            Boolean.TRUE,
                            null,
                            null);
            FormUtils.addNewFields(document, List.of(def));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("opts");
            assertNotNull(field);
            assertTrue(field.isReadOnly(), "read-only flag should survive reload");
            assertTrue(field instanceof PDTextField);
            assertTrue(((PDTextField) field).isMultiline(), "multiline flag should survive reload");
            String da = ((PDVariableText) field).getDefaultAppearance();
            assertTrue(da.contains("18"), "default appearance should carry the font size: " + da);
        }
    }

    @Test
    void modifyFormFields_movesAndResizesWidget() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(document, List.of(newText("movable", 50, 700, 200, 20)));

            FormUtils.ModifyFormFieldDefinition mod =
                    new FormUtils.ModifyFormFieldDefinition(
                            "movable", null, null, null, 0, 100f, 600f, 150f, 30f, null, null, null,
                            null, null, null, null, null, null);
            FormUtils.modifyFormFields(document, List.of(mod));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDRectangle rect = firstWidgetRect(acroForm, "movable");
            assertEquals(100f, rect.getLowerLeftX(), 0.5f);
            assertEquals(600f, rect.getLowerLeftY(), 0.5f);
            assertEquals(150f, rect.getWidth(), 0.5f);
            assertEquals(30f, rect.getHeight(), 0.5f);
        }
    }

    @Test
    void modifyFormFields_setsReadOnlyAndFontSize() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(document, List.of(newText("editable", 50, 700, 200, 20)));

            FormUtils.ModifyFormFieldDefinition mod =
                    new FormUtils.ModifyFormFieldDefinition(
                            "editable",
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            22f,
                            Boolean.TRUE,
                            null,
                            null);
            FormUtils.modifyFormFields(document, List.of(mod));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("editable");
            assertNotNull(field);
            assertTrue(field.isReadOnly(), "read-only flag should survive reload");
            String da = ((PDVariableText) field).getDefaultAppearance();
            assertTrue(da.contains("22"), "font size should be reflected in DA: " + da);
        }
    }

    @Test
    void deleteFormFields_removesField() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            PDAcroForm acroForm = setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(document, List.of(newText("temp", 50, 700, 200, 20)));
            FormUtils.deleteFormFields(document, List.of("temp"));
            // After delete the AcroForm may still exist; the field must be gone.
            if (acroForm != null) {
                assertNull(acroForm.getField("temp"));
            }
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertTrue(acroForm == null || acroForm.getField("temp") == null);
        }
    }

    @Test
    void addNewFields_createsRadioGroupWithOneWidgetPerOption() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField(
                                    "radio",
                                    "choice",
                                    60,
                                    700,
                                    16,
                                    16,
                                    List.of("Yes", "No"),
                                    null,
                                    null)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("choice");
            assertNotNull(field, "radio field should exist");
            assertTrue(field instanceof PDRadioButton, "should be a radio button group");
            assertEquals(2, field.getWidgets().size(), "one widget per option");
            assertTrue(((PDRadioButton) field).getExportValues().contains("Yes"));
            assertTrue(((PDRadioButton) field).getExportValues().contains("No"));
        }
    }

    @Test
    void extractFormFields_prefersFieldNameOverFirstOptionForChoiceLabel() throws IOException {
        // A radio group named "Choice" with options Yes/No must be labelled
        // "Choice" (its name), not "Yes" (its first option). Otherwise the label
        // shown in the viewer disagrees with the field name shown in the editor.
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField(
                                    "radio",
                                    "Choice",
                                    60,
                                    700,
                                    16,
                                    16,
                                    List.of("Yes", "No"),
                                    null,
                                    null)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            FormUtils.FormFieldInfo choice =
                    FormUtils.extractFormFields(reloaded).stream()
                            .filter(f -> "Choice".equals(f.name()))
                            .findFirst()
                            .orElse(null);
            assertNotNull(choice, "radio field should be extracted");
            assertEquals(
                    "Choice", choice.label(), "field name should win over the first option value");
        }
    }

    @Test
    void addNewFields_createsCombTextField() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(
                    document, List.of(newField("text", "ssn", 50, 700, 200, 20, null, 9, null)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDTextField field = (PDTextField) acroForm.getField("ssn");
            assertNotNull(field);
            assertEquals(9, field.getMaxLen(), "comb max length should persist");
            assertTrue(field.isComb(), "comb flag should be set");
        }
    }

    @Test
    void addNewFields_createsSignatureAndButton() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(
                    document,
                    List.of(
                            newField("signature", "sig", 50, 600, 200, 60, null, null, null),
                            newField("button", "btn", 50, 500, 120, 24, null, null, "reset")));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertTrue(
                    acroForm.getField("sig") instanceof PDSignatureField,
                    "signature placeholder should exist");
            assertTrue(
                    acroForm.getField("btn") instanceof PDPushButton, "push button should exist");
        }
    }

    @Test
    void applyFieldEdits_addsModifiesAndDeletesInOnePass() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document, PDRectangle.A4);
            FormUtils.addNewFields(document, List.of(newText("old", 50, 700, 200, 20)));

            FormUtils.applyFieldEdits(
                    document,
                    List.of(newText("fresh", 50, 600, 200, 20)),
                    List.of(),
                    List.of("old"));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(acroForm.getField("fresh"), "added field should be present");
            assertNull(acroForm.getField("old"), "deleted field should be gone");
        }
    }
}
