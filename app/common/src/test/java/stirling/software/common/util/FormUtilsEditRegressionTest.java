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
import org.apache.pdfbox.pdmodel.interactive.form.PDNonTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

/**
 * Guards the form editor against silently destroying a field it edits. Assertions run after a
 * save/reload cycle because only the serialised document reflects what a viewer sees.
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

    /** A drag must not normalise other options to the dragged widget's size. */
    @Test
    void movingRadioGroupKeepsEachOptionsOwnSize() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document,
                    List.of(newField("radio", "choice", 50, 700, 20, 20, List.of("A", "B"))));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            List<PDAnnotationWidget> widgets = form.getField("choice").getWidgets();
            // Hand-authored groups legitimately have option boxes of differing size.
            PDRectangle second = widgets.get(1).getRectangle();
            widgets.get(1)
                    .setRectangle(
                            new PDRectangle(
                                    second.getLowerLeftX(), second.getLowerLeftY(), 40f, 40f));
            FormUtils.modifyFormFields(document, List.of(moveTo("choice", 90f, 700f, 20f, 20f)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            List<PDAnnotationWidget> widgets = acroForm.getField("choice").getWidgets();
            assertEquals(
                    40f,
                    widgets.get(1).getRectangle().getWidth(),
                    0.5f,
                    "a pure drag must not shrink the other options");
            assertEquals(90f, widgets.get(0).getRectangle().getLowerLeftX(), 0.5f);
        }
    }

    /** With no /AP and no /Opt the on-state must come from /V, not the invented "Yes". */
    @Test
    void resizingCheckboxWithoutAppearanceKeepsItsExportValue() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("checkbox", "agree", 50, 700, 14, 14, null)));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            PDCheckBox box = (PDCheckBox) form.getField("agree");
            // A NeedAppearances form exported by Word/LibreOffice looks exactly like this.
            box.getWidgets().get(0).getCOSObject().removeItem(COSName.AP);
            box.getCOSObject().setItem(COSName.V, COSName.getPDFName("On"));
            FormUtils.modifyFormFields(document, List.of(moveTo("agree", 50f, 700f, 30f, 30f)));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDCheckBox box = (PDCheckBox) acroForm.getField("agree");
            assertEquals(
                    "On",
                    box.getOnValue(),
                    "the export value must survive; inventing 'Yes' would orphan /V");
            assertTrue(box.isChecked(), "the box was ticked and must stay ticked");
        }
    }

    /** Renaming to the same qualified name is not a rename, so a nested field is not rejected. */
    @Test
    void renameProblem_ignoresAnUnchangedQualifiedName() {
        assertNull(
                FormUtils.renameProblem("Customer.Name", "Customer.Name"),
                "a field standing still must not be rejected for its parent's period");
        assertNull(FormUtils.renameProblem("plain", null));
        assertNotNull(
                FormUtils.renameProblem("plain", "New.Name"),
                "an actual rename introducing a period must still be refused");
    }

    /** A nested field whose name box was left at its qualified name must still be modified. */
    @Test
    void modifyingNestedFieldKeepsWorkingWhenNameIsUntouched() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("text", "Name", 50, 700, 200, 20, null)));
            // Re-parent it so its qualified name legitimately contains a period.
            PDNonTerminalField parent = new PDNonTerminalField(form);
            parent.setPartialName("Customer");
            PDField child = form.getField("Name");
            parent.setChildren(List.of(child));
            child.getCOSObject().setItem(COSName.PARENT, parent.getCOSObject());
            form.setFields(List.of(parent));

            FormUtils.ModifyFormFieldDefinition mod =
                    new FormUtils.ModifyFormFieldDefinition(
                            "Customer.Name",
                            "Customer.Name",
                            null,
                            null,
                            0,
                            90f,
                            600f,
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
                            null);
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(mod), skipped);
            assertTrue(
                    skipped.isEmpty(), "an untouched qualified name is not a rename: " + skipped);
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("Customer.Name");
            assertNotNull(field, "the nested field must survive the edit");
            assertEquals(90f, field.getWidgets().get(0).getRectangle().getLowerLeftX(), 0.5f);
        }
    }

    /** Zero clears /MaxLen; null means unchanged, so it could never be removed otherwise. */
    @Test
    void maxLengthZeroClearsTheCombSetting() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document,
                    List.of(
                            new FormUtils.NewFormFieldDefinition(
                                    "code", null, "text", 0, 50f, 700f, 200f, 20f, null, null, null,
                                    null, null, null, null, null, 8, null)));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            assertEquals(8, ((PDTextField) form.getField("code")).getMaxLen());

            FormUtils.ModifyFormFieldDefinition clear =
                    new FormUtils.ModifyFormFieldDefinition(
                            "code", null, null, null, null, null, null, null, null, null, null,
                            null, null, null, null, null, null, 0, null);
            FormUtils.modifyFormFields(document, List.of(clear));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertEquals(
                    -1,
                    ((PDTextField) acroForm.getField("code")).getMaxLen(),
                    "/MaxLen should be gone, not merely zero");
        }
    }

    /** An unrecognised button action must be reported rather than silently ignored. */
    @Test
    void unknownButtonActionIsReported() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("button", "go", 50, 700, 100, 24, null)));

            FormUtils.ModifyFormFieldDefinition mod =
                    new FormUtils.ModifyFormFieldDefinition(
                            "go",
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
                            null,
                            null,
                            null,
                            null,
                            "launchTheMissiles");
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(mod), skipped);

            assertEquals(1, skipped.size(), "an unusable action spec should be reported");
            assertTrue(skipped.get(0).reason().contains("launchTheMissiles"));
        }
    }

    /** Renaming a nested field must not re-parent it to the top level. */
    @Test
    void renamingNestedFieldKeepsItUnderItsParent() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("text", "Name", 50, 700, 200, 20, null)));
            PDNonTerminalField parent = new PDNonTerminalField(form);
            parent.setPartialName("Customer");
            PDField child = form.getField("Name");
            parent.setChildren(List.of(child));
            child.getCOSObject().setItem(COSName.PARENT, parent.getCOSObject());
            form.setFields(List.of(parent));

            FormUtils.ModifyFormFieldDefinition rename =
                    new FormUtils.ModifyFormFieldDefinition(
                            "Customer.Name",
                            "Customer.Phone",
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
                            null,
                            null,
                            null,
                            null);
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(rename), skipped);
            assertTrue(
                    skipped.isEmpty(), "a leaf rename under the same parent is legal: " + skipped);
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(
                    acroForm.getField("Customer.Phone"),
                    "the field should still live under Customer, not at the top level");
            assertNull(acroForm.getField("Customer.Name"), "the old name should be gone");
        }
    }

    /** One rejected action on a multi-widget button is one report, not one per widget. */
    @Test
    void unknownButtonActionIsReportedOncePerField() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("button", "go", 50, 700, 100, 24, null)));
            PDAcroForm form = document.getDocumentCatalog().getAcroForm(null);
            PDField button = form.getField("go");
            // Give it a second widget, as a button repeated on two pages would have.
            PDAnnotationWidget extra = new PDAnnotationWidget();
            extra.setRectangle(new PDRectangle(50, 600, 100, 24));
            extra.getCOSObject().setItem(COSName.PARENT, button.getCOSObject());
            List<PDAnnotationWidget> widgets = new ArrayList<>(button.getWidgets());
            widgets.add(extra);
            button.getCOSObject()
                    .setItem(
                            COSName.KIDS,
                            new org.apache.pdfbox.cos.COSArray() {
                                {
                                    for (PDAnnotationWidget w : widgets) add(w.getCOSObject());
                                }
                            });

            FormUtils.ModifyFormFieldDefinition mod =
                    new FormUtils.ModifyFormFieldDefinition(
                            "go",
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
                            null,
                            null,
                            null,
                            null,
                            "launchTheMissiles");
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(mod), skipped);

            assertEquals(1, skipped.size(), "one field, one report: " + skipped);
        }
    }

    /** A clamped page index still creates the field, so it is not a dropped edit. */
    @Test
    void clampedPageIsNotReportedAsSkipped() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.addNewFields(
                    document,
                    List.of(
                            new FormUtils.NewFormFieldDefinition(
                                    "late", null, "text", 9, 50f, 700f, 100f, 20f, null, null, null,
                                    null, null, null, null, null, null, null)),
                    skipped);

            assertNotNull(
                    document.getDocumentCatalog().getAcroForm(null).getField("late"),
                    "the field is created on the clamped page");
            assertTrue(skipped.isEmpty(), "an applied edit must not appear as skipped: " + skipped);
        }
    }

    /** Recreation builds a top-level field, so it must refuse rather than re-parent. */
    @Test
    void typeChangeOnNestedFieldIsRefusedNotSilentlyReparented() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("text", "Name", 50, 700, 200, 20, null)));
            PDNonTerminalField parent = new PDNonTerminalField(form);
            parent.setPartialName("Customer");
            PDField child = form.getField("Name");
            parent.setChildren(List.of(child));
            child.getCOSObject().setItem(COSName.PARENT, parent.getCOSObject());
            form.setFields(List.of(parent));

            FormUtils.ModifyFormFieldDefinition retype =
                    new FormUtils.ModifyFormFieldDefinition(
                            "Customer.Name",
                            null,
                            null,
                            "checkbox",
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
                            null,
                            null);
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(retype), skipped);

            assertEquals(1, skipped.size(), "the refusal must be reported: " + skipped);
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            assertNotNull(
                    acroForm.getField("Customer.Name"),
                    "the original nested field must be left intact");
            assertNull(acroForm.getField("Name"), "nothing should be re-parented to the top level");
        }
    }

    /** The editor emits "uri:" the moment that kind is picked, which must not fail the edit. */
    @Test
    void incompleteUrlActionClearsRatherThanFailing() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("button", "go", 50, 700, 100, 24, null)));

            FormUtils.ModifyFormFieldDefinition pickUri =
                    new FormUtils.ModifyFormFieldDefinition(
                            "go", null, null, null, null, null, null, null, null, null, null, null,
                            null, null, null, null, null, null, "uri:");
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(pickUri), skipped);

            assertTrue(
                    skipped.isEmpty(),
                    "choosing a URL action before typing the URL is not an error: " + skipped);
            PDField button = document.getDocumentCatalog().getAcroForm(null).getField("go");
            assertNull(
                    button.getWidgets().get(0).getCOSObject().getDictionaryObject(COSName.A),
                    "an empty target must leave no action behind");
        }
    }

    /** A real URL still writes a real action. */
    @Test
    void completeUrlActionIsApplied() throws IOException {
        try (PDDocument document = new PDDocument()) {
            setupForm(document);
            FormUtils.addNewFields(
                    document, List.of(newField("button", "go", 50, 700, 100, 24, null)));

            FormUtils.ModifyFormFieldDefinition setUri =
                    new FormUtils.ModifyFormFieldDefinition(
                            "go",
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
                            null,
                            null,
                            null,
                            null,
                            "uri:https://example.com");
            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(setUri), skipped);

            assertTrue(skipped.isEmpty(), "a complete spec applies cleanly: " + skipped);
            PDField button = document.getDocumentCatalog().getAcroForm(null).getField("go");
            assertNotNull(
                    button.getWidgets().get(0).getCOSObject().getDictionaryObject(COSName.A),
                    "the action should be written");
        }
    }

    /** Builds a parent with the given terminal children already attached. */
    private static PDNonTerminalField nest(
            PDDocument document, PDAcroForm form, String parentName, String... childNames)
            throws IOException {
        List<FormUtils.NewFormFieldDefinition> defs = new ArrayList<>();
        for (int i = 0; i < childNames.length; i++) {
            defs.add(newField("text", childNames[i], 50, 700 - i * 40, 200, 20, null));
        }
        FormUtils.addNewFields(document, defs);

        PDNonTerminalField parent = new PDNonTerminalField(form);
        parent.setPartialName(parentName);
        List<PDField> kids = new ArrayList<>();
        for (String child : childNames) {
            PDField field = form.getField(child);
            field.getCOSObject().setItem(COSName.PARENT, parent.getCOSObject());
            kids.add(field);
        }
        parent.setChildren(kids);
        form.setFields(List.of(parent));
        return parent;
    }

    /** A refused edit must not release the name the field still really has. */
    @Test
    void refusedNestedEditDoesNotFreeItsNameForALaterEdit() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = setupForm(document);
            nest(document, form, "Customer", "Name", "Email");

            // Edit 1 is refused (type change on a nested field). Edit 2 then asks for the
            // name edit 1 still occupies, which must not be handed out.
            FormUtils.ModifyFormFieldDefinition refused =
                    new FormUtils.ModifyFormFieldDefinition(
                            "Customer.Name",
                            "Customer.Foo",
                            null,
                            "checkbox",
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
                            null,
                            null);
            FormUtils.ModifyFormFieldDefinition rename =
                    new FormUtils.ModifyFormFieldDefinition(
                            "Customer.Email",
                            "Customer.Name",
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
                            null,
                            null,
                            null,
                            null);

            List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
            FormUtils.modifyFormFields(document, List.of(refused, rename), skipped);

            List<String> names = new ArrayList<>();
            for (PDField f : document.getDocumentCatalog().getAcroForm(null).getFieldTree()) {
                if (f instanceof PDTerminalField) names.add(f.getFullyQualifiedName());
            }
            assertEquals(
                    names.size(),
                    new java.util.HashSet<>(names).size(),
                    "two fields must never share a qualified name: " + names);
            assertTrue(
                    names.contains("Customer.Name"), "the refused field keeps its name: " + names);
        }
    }

    /** A group name occupies the namespace, so a new field must not be able to take it. */
    @Test
    void groupNamesParticipateInCollisionChecks() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = setupForm(document);
            nest(document, form, "Customer", "Name");

            FormUtils.addNewFields(
                    document, List.of(newField("text", "Customer", 50, 500, 100, 20, null)));

            List<String> names = new ArrayList<>();
            for (PDField f : document.getDocumentCatalog().getAcroForm(null).getFieldTree()) {
                String fqn = f.getFullyQualifiedName();
                if (fqn != null) names.add(fqn);
            }
            assertEquals(
                    names.size(),
                    new java.util.HashSet<>(names).size(),
                    "the new field must not take the group's name: " + names);
        }
    }

    /** "Customer." has no leaf, so it must be refused rather than become "Customer.field". */
    @Test
    void renameToBareParentPrefixIsRefused() {
        assertNotNull(
                FormUtils.renameProblem("Customer.Name", "Customer."),
                "a name with nothing after the parent prefix is not a rename");
        assertNull(FormUtils.renameProblem("Customer.Name", "Customer.Phone"));
    }

    /** A type change must leave the field on its own page, not relocate it to the last one. */
    @Test
    void typeChangeKeepsTheFieldOnItsPage() throws IOException {
        byte[] saved;
        try (PDDocument document = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(document);
            for (int i = 0; i < 5; i++) {
                document.addPage(new PDPage(PDRectangle.A4));
            }
            form.setDefaultResources(new PDResources());
            document.getDocumentCatalog().setAcroForm(form);

            FormUtils.addNewFields(
                    document,
                    List.of(
                            new FormUtils.NewFormFieldDefinition(
                                    "onPageTwo",
                                    null,
                                    "text",
                                    1,
                                    50f,
                                    700f,
                                    200f,
                                    20f,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null)));

            FormUtils.ModifyFormFieldDefinition retype =
                    new FormUtils.ModifyFormFieldDefinition(
                            "onPageTwo",
                            null,
                            null,
                            "checkbox",
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
                            null,
                            null);
            FormUtils.modifyFormFields(document, List.of(retype));
            saved = save(document);
        }

        try (PDDocument reloaded = Loader.loadPDF(saved)) {
            PDAcroForm acroForm = reloaded.getDocumentCatalog().getAcroForm(null);
            PDField field = acroForm.getField("onPageTwo");
            assertNotNull(field, "the retyped field should exist");
            int page = -1;
            for (int i = 0; i < reloaded.getNumberOfPages(); i++) {
                for (var annot : reloaded.getPage(i).getAnnotations()) {
                    if (annot.getCOSObject() == field.getWidgets().get(0).getCOSObject()) page = i;
                }
            }
            assertEquals(
                    1, page, "a retyped field must stay on its own page, not move to the last");
        }
    }
}
