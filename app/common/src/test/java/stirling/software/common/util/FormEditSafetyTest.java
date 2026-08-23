package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.FormFieldWithCoordinates;

/** An edit that cannot be honoured must be refused and reported, never silently reshaped. */
class FormEditSafetyTest {

    private static PDDocument formWith(String name, String type) throws IOException {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(PDRectangle.A4));
        document.getDocumentCatalog().setAcroForm(new PDAcroForm(document));
        FormUtils.addNewFields(
                document,
                List.of(
                        new FormUtils.NewFormFieldDefinition(
                                name,
                                null,
                                type,
                                0,
                                50f,
                                700f,
                                200f,
                                20f,
                                null,
                                null,
                                type.equals("radio") ? List.of("a", "b") : null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null,
                                null)));
        return document;
    }

    private static FormUtils.ModifyFormFieldDefinition modify(
            String target, String type, Float width, Float height) {
        // Order: targetName, name, label, type, pageIndex, x, y, width, height, then the rest.
        return new FormUtils.ModifyFormFieldDefinition(
                target, null, null, type, null, null, null, width, height, null, null, null, null,
                null, null, null, null, null, null);
    }

    @Test
    @DisplayName("a type that cannot be rebuilt is refused instead of becoming a text field")
    void unrebuildableTypeIsRefused() throws IOException {
        try (PDDocument document = formWith("choice", "text")) {
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();

            FormUtils.modifyFormFields(
                    document, List.of(modify("choice", "radio", null, null)), skipped);

            PDField field = document.getDocumentCatalog().getAcroForm(null).getField("choice");
            assertFalse(skipped.isEmpty(), "the refusal must be reported to the caller");
            assertFalse(
                    field instanceof PDRadioButton,
                    "it could not become a radio, so it must not claim to be one");
            assertEquals(
                    "text",
                    FormUtils.extractFormFields(document).getFirst().type(),
                    "the original field must survive untouched rather than be retyped");
        }
    }

    @Test
    @DisplayName("a field rebuilt as a checkbox gets an appearance so it can be ticked")
    void rebuiltCheckboxIsUsable() throws IOException {
        try (PDDocument document = formWith("agree", "text")) {
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();

            FormUtils.modifyFormFields(
                    document, List.of(modify("agree", "checkbox", null, null)), skipped);

            PDField field = document.getDocumentCatalog().getAcroForm(null).getField("agree");
            assertTrue(field instanceof PDCheckBox, "the rebuild should have produced a checkbox");
            assertNotNull(
                    field.getWidgets().getFirst().getAppearance(),
                    "without an appearance the checkbox renders blank and cannot be ticked");
        }
    }

    @Test
    @DisplayName("a size of zero or infinity is refused rather than written into the page")
    void unusableSizeIsRefused() throws IOException {
        for (Float bad : new Float[] {0f, -5f, Float.POSITIVE_INFINITY, Float.NaN}) {
            try (PDDocument document = formWith("box", "text")) {
                List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();

                FormUtils.modifyFormFields(
                        document, List.of(modify("box", null, bad, 20f)), skipped);

                PDRectangle rect =
                        document.getDocumentCatalog()
                                .getAcroForm(null)
                                .getField("box")
                                .getWidgets()
                                .getFirst()
                                .getRectangle();
                assertFalse(skipped.isEmpty(), "a refused resize must be reported: width " + bad);
                assertEquals(
                        200f,
                        rect.getWidth(),
                        0.01f,
                        "the original size must survive: width " + bad);
            }
        }
    }

    @Test
    @DisplayName("a widget off the page still reports its geometry instead of dropping the field")
    void offPageWidgetKeepsItsGeometry() throws IOException {
        try (PDDocument document = formWith("stray", "text")) {
            PDField field = document.getDocumentCatalog().getAcroForm(null).getField("stray");
            // Above the page top: legal PDF, and the user needs the coordinates to drag it back.
            field.getWidgets().getFirst().setRectangle(new PDRectangle(50f, 2000f, 200f, 20f));

            List<FormFieldWithCoordinates> fields =
                    FormUtils.extractFormFieldsWithCoordinates(document);

            FormFieldWithCoordinates stray =
                    fields.stream()
                            .filter(f -> "stray".equals(f.getName()))
                            .findFirst()
                            .orElseThrow();
            assertNotNull(stray.getWidgets(), "the field must keep its widget list");
            assertFalse(stray.getWidgets().isEmpty(), "the off-page widget must still be reported");
            assertNotNull(stray.getWidgets().getFirst(), "a null entry would crash the overlay");
        }
    }

    private static FormUtils.ModifyFormFieldDefinition withValue(String target, String value) {
        return new FormUtils.ModifyFormFieldDefinition(
                target, null, null, null, null, null, null, null, null, null, null, null, value,
                null, null, null, null, null, null);
    }

    private static FormUtils.ModifyFormFieldDefinition withOptions(
            String target, List<String> options) {
        return new FormUtils.ModifyFormFieldDefinition(
                target, null, null, null, null, null, null, null, null, null, null, options, null,
                null, null, null, null, null, null);
    }

    @Test
    @DisplayName("a value a radio group cannot hold does not destroy the group")
    void badRadioValueLeavesTheGroupIntact() throws IOException {
        try (PDDocument document = formWith("plan", "radio")) {
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();

            FormUtils.modifyFormFields(
                    document, List.of(withValue("plan", "not-an-option")), skipped);

            PDField field = document.getDocumentCatalog().getAcroForm(null).getField("plan");
            assertTrue(
                    field instanceof PDRadioButton,
                    "a rejected value must not turn the group into another kind of field");
            assertEquals(
                    2,
                    field.getWidgets().size(),
                    "the group's options must survive a rejected value");
            assertFalse(skipped.isEmpty(), "the caller must be told the value was not applied");
        }
    }

    @Test
    @DisplayName("editing a radio group's options is either applied or reported, never ignored")
    void radioOptionEditIsNotSilentlyDropped() throws IOException {
        try (PDDocument document = formWith("plan", "radio")) {
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();

            FormUtils.modifyFormFields(
                    document, List.of(withOptions("plan", List.of("a", "b", "c"))), skipped);

            PDField field = document.getDocumentCatalog().getAcroForm(null).getField("plan");
            boolean applied = field.getWidgets().size() == 3;
            assertTrue(
                    applied || !skipped.isEmpty(),
                    "a change the UI shows as saved must either happen or be reported as skipped");
        }
    }
}
