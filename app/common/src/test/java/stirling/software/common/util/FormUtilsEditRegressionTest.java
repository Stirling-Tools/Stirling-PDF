package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.junit.jupiter.api.Test;

/**
 * Regressions for the form-editor review findings on PR #6655.
 *
 * <p>The headline one is silent data loss: the geometry path stripped {@code /AP} for every field
 * type, and {@link PDAcroForm#refreshAppearances()} never rebuilds it for the button family, so
 * dragging a checkbox left it invisible and permanently unfillable. Assertions run after a save →
 * reload cycle because only the serialised document reflects what a viewer sees.
 */
class FormUtilsEditRegressionTest {

    private static PDAcroForm setupForm(PDDocument document) {
        document.addPage(new PDPage(PDRectangle.A4));
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

    private static FormUtils.NewFormFieldDefinition newField(
            String type, String name, float x, float y, float w, float h, List<String> options) {
        return new FormUtils.NewFormFieldDefinition(
                name, null, type, 0, x, y, w, h, null, null, options, null, null, null, null, null,
                null, null);
    }

    /** Moves a field to a rect; null width/height leave the size alone. */
    private static FormUtils.ModifyFormFieldDefinition moveTo(
            String target, float x, float y, Float w, Float h) {
        return new FormUtils.ModifyFormFieldDefinition(
                target, null, null, null, 0, x, y, w, h, null, null, null, null, null, null, null,
                null, null, null);
    }

    private static PDRectangle firstWidgetRect(PDAcroForm acroForm, String name) {
        PDField field = acroForm.getField(name);
        assertNotNull(field, "field '" + name + "' should exist");
        return field.getWidgets().get(0).getRectangle();
    }

    /** The /AP /N state names on a widget. */
    private static Set<String> normalStateNames(PDAnnotationWidget widget) {
        PDAppearanceDictionary appearance = widget.getAppearance();
        assertNotNull(appearance, "widget should have an /AP dictionary");
        PDAppearanceEntry normal = appearance.getNormalAppearance();
        assertNotNull(normal, "widget should have an /AP /N entry");
        assertTrue(normal.isSubDictionary(), "a toggle needs per-state appearances");
        return normal.getSubDictionary().keySet().stream()
                .map(COSName::getName)
                .collect(Collectors.toSet());
    }

    @Test
    void movingCheckboxKeepsItFillable() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("checkbox", "agree", 50, 700, 14, 14, null)));
            FormUtils.modifyFormFields(document, List.of(moveTo("agree", 200f, 400f, null, null)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("agree");
            assertTrue(field instanceof PDCheckBox, "'agree' should still be a checkbox");
            assertFalse(
                    ((PDCheckBox) field).getOnValue().isEmpty(),
                    "a moved checkbox must keep an on-state, or it can never be ticked again");
            assertTrue(
                    normalStateNames(field.getWidgets().get(0)).size() >= 2,
                    "both /AP /N states must survive a move");
            PDRectangle rect = firstWidgetRect(acroForm, "agree");
            assertEquals(200f, rect.getLowerLeftX(), 0.5f);
            assertEquals(400f, rect.getLowerLeftY(), 0.5f);
        }
    }

    @Test
    void resizingCheckboxRebuildsAppearanceAtTheNewSize() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("checkbox", "agree", 50, 700, 14, 14, null)));
            FormUtils.modifyFormFields(document, List.of(moveTo("agree", 50f, 700f, 28f, 28f)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDCheckBox checkBox = (PDCheckBox) acroForm.getField("agree");
            assertFalse(
                    checkBox.getOnValue().isEmpty(), "a resized checkbox must keep its on-state");
            PDAnnotationWidget widget = checkBox.getWidgets().get(0);
            assertTrue(normalStateNames(widget).size() >= 2, "both /AP /N states must be rebuilt");
            PDRectangle bbox =
                    widget.getAppearance()
                            .getNormalAppearance()
                            .getSubDictionary()
                            .get(COSName.getPDFName(checkBox.getOnValue()))
                            .getBBox();
            assertEquals(28f, bbox.getWidth(), 0.5f, "the rebuilt /AP must match the new size");
        }
    }

    /** applyToggleAppearance parks /AS on Off, so a resize must put the selection back. */
    @Test
    void resizingCheckboxKeepsItChecked() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("checkbox", "agree", 50, 700, 14, 14, null)));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            ((PDCheckBox) form.getField("agree")).check();
            FormUtils.modifyFormFields(document, List.of(moveTo("agree", 50f, 700f, 30f, 30f)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertTrue(
                    ((PDCheckBox) acroForm.getField("agree")).isChecked(),
                    "a resize must not silently untick the box");
        }
    }

    /** Only widgets.get(0) used to move, so a radio group lost every option but the first. */
    @Test
    void movingRadioGroupMovesEveryOption() throws IOException {
        byte[] saved;
        float[] before = new float[6];
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document,
                    List.of(newField("radio", "choice", 50, 700, 14, 14, List.of("A", "B", "C"))));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            List<PDAnnotationWidget> widgets = form.getField("choice").getWidgets();
            assertEquals(3, widgets.size(), "the fixture needs three option widgets");
            for (int i = 0; i < 3; i++) {
                before[i * 2] = widgets.get(i).getRectangle().getLowerLeftX();
                before[i * 2 + 1] = widgets.get(i).getRectangle().getLowerLeftY();
            }
            FormUtils.modifyFormFields(document, List.of(moveTo("choice", 90f, 670f, null, null)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("choice");
            assertTrue(field instanceof PDRadioButton, "'choice' should still be a radio group");
            List<PDAnnotationWidget> widgets = field.getWidgets();
            assertEquals(3, widgets.size(), "no option may be left behind");
            float dx = 90f - before[0];
            float dy = 670f - before[1];
            for (int i = 0; i < 3; i++) {
                PDRectangle rect = widgets.get(i).getRectangle();
                assertEquals(
                        before[i * 2] + dx,
                        rect.getLowerLeftX(),
                        0.5f,
                        "option " + i + " should shift by the same delta");
                assertEquals(before[i * 2 + 1] + dy, rect.getLowerLeftY(), 0.5f);
            }
        }
    }

    /** A signature's /AP is the signature, so it must never be dropped. */
    @Test
    void movingSignatureKeepsItsAppearance() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("signature", "sig", 50, 700, 120, 40, null)));
            FormUtils.modifyFormFields(document, List.of(moveTo("sig", 60f, 600f, 140f, 50f)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertTrue(
                    acroForm.getField("sig") instanceof PDSignatureField,
                    "'sig' should still be a signature");
            assertEquals(60f, firstWidgetRect(acroForm, "sig").getLowerLeftX(), 0.5f);
        }
    }

    @Test
    void invalidFieldNameReason_rejectsPeriodAndAllowsTheRest() {
        String reason = FormUtils.invalidFieldNameReason("Customer.Name");
        assertNotNull(reason, "a period must be refused, not silently dropped");
        assertTrue(reason.contains("period"), "the message should name the offending character");
        assertNull(FormUtils.invalidFieldNameReason("Has Space"));
        assertNull(FormUtils.invalidFieldNameReason("weird/[]{}"));
        assertNull(FormUtils.invalidFieldNameReason(null));
    }

    /** Dropped operations used to log a warning and still report success. */
    @Test
    void applyFieldEdits_reportsEveryDroppedOperation() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("text", "present", 50, 700, 200, 20, null)));

            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.applyFieldEdits(
                    document,
                    List.of(newField("text", "Bad.Name", 50, 600, 100, 20, null)),
                    List.of(moveTo("ghost", 10f, 10f, null, null)),
                    List.of("alsoGhost"),
                    skipped);

            assertEquals(3, skipped.size(), "each dropped operation should be reported");
            assertTrue(skipped.stream().anyMatch(s -> "add".equals(s.operation())));
            assertTrue(skipped.stream().anyMatch(s -> "modify".equals(s.operation())));
            assertTrue(skipped.stream().anyMatch(s -> "delete".equals(s.operation())));
            assertNotNull(
                    document.getDocumentCatalog().getAcroForm(null).getField("present"),
                    "the rest of the document must still be applied");
        }
    }

    /** A clean batch must not report anything, or the UI would cry wolf on every save. */
    @Test
    void applyFieldEdits_reportsNothingWhenEverythingApplies() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.applyFieldEdits(
                    document,
                    List.of(newField("text", "fine", 50, 700, 200, 20, null)),
                    List.of(),
                    List.of(),
                    skipped);
            assertTrue(skipped.isEmpty(), "a fully applied batch reports no skips");
        }
    }
}
