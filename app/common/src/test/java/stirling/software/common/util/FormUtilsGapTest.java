package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Gap coverage for {@link FormUtils} methods not exercised by {@code FormUtilsTest} (disabled) or
 * {@code FormUtilsAdditionalTest}. Focuses on coordinate extraction, the page-map / repair / prune
 * / delete / modify lifecycle, and the package-private parsing helpers.
 */
class FormUtilsGapTest {

    private record SetupDocument(PDPage page, PDAcroForm acroForm) {}

    private static SetupDocument createBasicDocument(PDDocument document) {
        PDPage page = new PDPage();
        document.addPage(page);

        PDAcroForm acroForm = new PDAcroForm(document);
        // Register a Helvetica font in the default resources and set a default appearance so
        // PDFBox can write text-field values without throwing "/DA is a required entry".
        PDResources dr = new PDResources();
        dr.put(COSName.getPDFName("Helv"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
        acroForm.setDefaultResources(dr);
        acroForm.setDefaultAppearance("/Helv 12 Tf 0 g");
        acroForm.setNeedAppearances(true);
        document.getDocumentCatalog().setAcroForm(acroForm);

        return new SetupDocument(page, acroForm);
    }

    private static void attachWidget(
            SetupDocument setup, PDTerminalField field, PDRectangle rectangle) throws IOException {
        PDAnnotationWidget widget = new PDAnnotationWidget();
        widget.setRectangle(rectangle);
        widget.setPage(setup.page());
        // Start from an empty list: a fresh terminal field has no /Kids, so getWidgets() would
        // return a synthetic widget wrapping the field dict itself. Re-adding that turns the field
        // into a self-referential non-terminal field whose getWidgets() is empty.
        List<PDAnnotationWidget> widgets = new ArrayList<>();
        widgets.add(widget);
        field.setWidgets(widgets);
        setup.acroForm().getFields().add(field);
        setup.page().getAnnotations().add(widget);
    }

    // ----------------------------------------------------------------------
    // Constants
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("Field type constants")
    class Constants {

        @Test
        void typeConstantsHaveExpectedValues() {
            assertEquals("text", FormUtils.FIELD_TYPE_TEXT);
            assertEquals("checkbox", FormUtils.FIELD_TYPE_CHECKBOX);
            assertEquals("combobox", FormUtils.FIELD_TYPE_COMBOBOX);
            assertEquals("listbox", FormUtils.FIELD_TYPE_LISTBOX);
            assertEquals("radio", FormUtils.FIELD_TYPE_RADIO);
            assertEquals("button", FormUtils.FIELD_TYPE_BUTTON);
            assertEquals("signature", FormUtils.FIELD_TYPE_SIGNATURE);
        }

        @Test
        void choiceFieldTypesContainsExpectedMembers() {
            assertTrue(FormUtils.CHOICE_FIELD_TYPES.contains("combobox"));
            assertTrue(FormUtils.CHOICE_FIELD_TYPES.contains("listbox"));
            assertTrue(FormUtils.CHOICE_FIELD_TYPES.contains("radio"));
            assertFalse(FormUtils.CHOICE_FIELD_TYPES.contains("text"));
            assertEquals(3, FormUtils.CHOICE_FIELD_TYPES.size());
        }
    }

    // ----------------------------------------------------------------------
    // detectFieldType (choice/radio/signature/button branches)
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("detectFieldType")
    class DetectFieldType {

        @Test
        void comboBoxDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                assertEquals(
                        "combobox", FormUtils.detectFieldType(new PDComboBox(setup.acroForm())));
            }
        }

        @Test
        void listBoxDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                assertEquals("listbox", FormUtils.detectFieldType(new PDListBox(setup.acroForm())));
            }
        }

        @Test
        void radioButtonDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                assertEquals(
                        "radio", FormUtils.detectFieldType(new PDRadioButton(setup.acroForm())));
            }
        }

        @Test
        void signatureDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                assertEquals(
                        "signature",
                        FormUtils.detectFieldType(new PDSignatureField(setup.acroForm())));
            }
        }
    }

    // ----------------------------------------------------------------------
    // isChecked
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("isChecked")
    class IsChecked {

        @Test
        void nullIsFalse() {
            assertFalse(FormUtils.isChecked(null));
        }

        @Test
        void truthyValuesAreChecked() {
            assertTrue(FormUtils.isChecked("true"));
            assertTrue(FormUtils.isChecked("1"));
            assertTrue(FormUtils.isChecked("yes"));
            assertTrue(FormUtils.isChecked("on"));
            assertTrue(FormUtils.isChecked("checked"));
        }

        @Test
        void truthyValuesAreCaseInsensitiveAndTrimmed() {
            assertTrue(FormUtils.isChecked("  TRUE  "));
            assertTrue(FormUtils.isChecked("Yes"));
            assertTrue(FormUtils.isChecked("ON"));
        }

        @Test
        void falsyValuesAreNotChecked() {
            assertFalse(FormUtils.isChecked("false"));
            assertFalse(FormUtils.isChecked("0"));
            assertFalse(FormUtils.isChecked("off"));
            assertFalse(FormUtils.isChecked(""));
            assertFalse(FormUtils.isChecked("anything"));
        }
    }

    // ----------------------------------------------------------------------
    // safeValue
    // ----------------------------------------------------------------------

    @Test
    void safeValueEmptyStringPassesThrough() {
        assertEquals("", FormUtils.safeValue(""));
    }

    // ----------------------------------------------------------------------
    // parseMultiChoiceSelections
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("parseMultiChoiceSelections")
    class ParseMultiChoiceSelections {

        @Test
        void nullReturnsEmpty() {
            assertTrue(FormUtils.parseMultiChoiceSelections(null).isEmpty());
        }

        @Test
        void blankReturnsEmpty() {
            assertTrue(FormUtils.parseMultiChoiceSelections("   ").isEmpty());
        }

        @Test
        void splitsAndTrims() {
            List<String> result = FormUtils.parseMultiChoiceSelections(" a , b ,c ");
            assertEquals(List.of("a", "b", "c"), result);
        }

        @Test
        void dropsEmptySegments() {
            List<String> result = FormUtils.parseMultiChoiceSelections("a,,b,");
            assertEquals(List.of("a", "b"), result);
        }
    }

    // ----------------------------------------------------------------------
    // filterChoiceSelections
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("filterChoiceSelections")
    class FilterChoiceSelections {

        @Test
        void nullSelectionsReturnsEmpty() {
            assertTrue(FormUtils.filterChoiceSelections(null, List.of("A"), "f").isEmpty());
        }

        @Test
        void emptySelectionsReturnsEmpty() {
            assertTrue(FormUtils.filterChoiceSelections(List.of(), List.of("A"), "f").isEmpty());
        }

        @Test
        void selectionsOfOnlyBlanksReturnsEmpty() {
            List<String> selections = new ArrayList<>();
            selections.add("  ");
            selections.add(null);
            assertTrue(FormUtils.filterChoiceSelections(selections, List.of("A"), "f").isEmpty());
        }

        @Test
        void matchingSelectionsAreKeptCaseInsensitively() {
            List<String> result =
                    FormUtils.filterChoiceSelections(
                            List.of("apple", "BANANA"), List.of("Apple", "Banana", "Cherry"), "f");
            // The resolved (canonical) allowed option is returned, not the input.
            assertEquals(List.of("Apple", "Banana"), result);
        }

        @Test
        void unsupportedSelectionsAreDropped() {
            List<String> result =
                    FormUtils.filterChoiceSelections(
                            List.of("Apple", "Grape"), List.of("Apple", "Banana"), "f");
            assertEquals(List.of("Apple"), result);
        }

        @Test
        void missingAllowedOptionsThrows() {
            org.junit.jupiter.api.Assertions.assertThrows(
                    IllegalArgumentException.class,
                    () -> FormUtils.filterChoiceSelections(List.of("Apple"), List.of(), "fieldX"));
        }

        @Test
        void nullAllowedOptionsThrows() {
            org.junit.jupiter.api.Assertions.assertThrows(
                    IllegalArgumentException.class,
                    () -> FormUtils.filterChoiceSelections(List.of("Apple"), null, "fieldX"));
        }
    }

    // ----------------------------------------------------------------------
    // resolveOptions / resolveDisplayOptions / collectChoiceAllowedValues
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("option resolution")
    class OptionResolution {

        @Test
        void resolveOptionsForComboBox() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setOptions(List.of("Red", "Green", "Blue"));
                List<String> options = FormUtils.resolveOptions(combo);
                assertTrue(options.contains("Red"));
                assertTrue(options.contains("Green"));
                assertTrue(options.contains("Blue"));
            }
        }

        @Test
        void resolveOptionsForTextFieldIsEmpty() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                assertTrue(FormUtils.resolveOptions(text).isEmpty());
            }
        }

        @Test
        void resolveOptionsForCheckBoxUsesExportValues() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDCheckBox checkBox = new PDCheckBox(setup.acroForm());
                checkBox.setExportValues(List.of("Yes"));
                assertEquals(List.of("Yes"), FormUtils.resolveOptions(checkBox));
            }
        }

        @Test
        void resolveDisplayOptionsEmptyForTextField() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                assertTrue(FormUtils.resolveDisplayOptions(text).isEmpty());
            }
        }

        @Test
        void collectChoiceAllowedValuesNullReturnsEmpty() {
            assertTrue(FormUtils.collectChoiceAllowedValues(null).isEmpty());
        }

        @Test
        void collectChoiceAllowedValuesReturnsOptions() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setOptions(List.of("One", "Two"));
                List<String> allowed = FormUtils.collectChoiceAllowedValues(combo);
                assertTrue(allowed.contains("One"));
                assertTrue(allowed.contains("Two"));
            }
        }
    }

    // ----------------------------------------------------------------------
    // setTextValue
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("setTextValue")
    class SetTextValue {

        @Test
        void writesValue() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("note");
                text.setDefaultAppearance("/Helv 12 Tf 0 g");
                attachWidget(setup, text, new PDRectangle(20, 600, 200, 20));

                FormUtils.setTextValue(text, "hello world");
                assertEquals("hello world", text.getValueAsString());
            }
        }

        @Test
        void nullValueWritesEmptyString() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("note");
                text.setDefaultAppearance("/Helv 12 Tf 0 g");
                attachWidget(setup, text, new PDRectangle(20, 600, 200, 20));

                FormUtils.setTextValue(text, null);
                assertEquals("", text.getValueAsString());
            }
        }
    }

    // ----------------------------------------------------------------------
    // buildFillTemplateRecord (choice branches not covered elsewhere)
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("buildFillTemplateRecord")
    class BuildFillTemplateRecord {

        @Test
        void comboBoxUsesCurrentValue() {
            FormUtils.FormFieldInfo info =
                    new FormUtils.FormFieldInfo(
                            "color", "Color", "combobox", "Red", null, false, 0, false, null, 0);
            Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
            assertEquals("Red", result.get("color"));
        }

        @Test
        void singleSelectListBoxUsesValue() {
            FormUtils.FormFieldInfo info =
                    new FormUtils.FormFieldInfo(
                            "list", "List", "listbox", "Item1", null, false, 0, false, null, 0);
            Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
            assertEquals("Item1", result.get("list"));
        }

        @Test
        void multiSelectListBoxUsesEmptyArray() {
            FormUtils.FormFieldInfo info =
                    new FormUtils.FormFieldInfo(
                            "list", "List", "listbox", "Item1", null, false, 0, true, null, 0);
            Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
            Object value = result.get("list");
            assertTrue(value instanceof List<?>);
            assertTrue(((List<?>) value).isEmpty());
        }

        @Test
        void nullValueDefaultsToEmptyString() {
            FormUtils.FormFieldInfo info =
                    new FormUtils.FormFieldInfo(
                            "name", "Name", "text", null, null, false, 0, false, null, 0);
            Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
            assertEquals("", result.get("name"));
        }

        @Test
        void entriesWithBlankNamesAreSkipped() {
            FormUtils.FormFieldInfo blank =
                    new FormUtils.FormFieldInfo(
                            "  ", "Blank", "text", "x", null, false, 0, false, null, 0);
            FormUtils.FormFieldInfo good =
                    new FormUtils.FormFieldInfo(
                            "kept", "Kept", "text", "x", null, false, 0, false, null, 0);
            Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(blank, good));
            assertEquals(1, result.size());
            assertTrue(result.containsKey("kept"));
        }
    }

    // ----------------------------------------------------------------------
    // buildAnnotationPageMap
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("buildAnnotationPageMap")
    class BuildAnnotationPageMap {

        @Test
        void nullDocumentReturnsEmpty() {
            assertTrue(FormUtils.buildAnnotationPageMap(null).isEmpty());
        }

        @Test
        void emptyDocumentReturnsEmpty() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                assertTrue(FormUtils.buildAnnotationPageMap(doc).isEmpty());
            }
        }

        @Test
        void mapsWidgetToItsPageIndex() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("a");
                attachWidget(setup, text, new PDRectangle(10, 10, 100, 20));

                Map<COSDictionary, Integer> map = FormUtils.buildAnnotationPageMap(doc);
                assertEquals(1, map.size());
                assertTrue(map.containsValue(0));
            }
        }
    }

    // ----------------------------------------------------------------------
    // extractFormFieldsWithCoordinates
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("extractFormFieldsWithCoordinates")
    class ExtractFormFieldsWithCoordinates {

        @Test
        void nullDocumentReturnsEmpty() {
            assertTrue(FormUtils.extractFormFieldsWithCoordinates(null).isEmpty());
        }

        @Test
        void noAcroFormReturnsEmpty() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                assertTrue(FormUtils.extractFormFieldsWithCoordinates(doc).isEmpty());
            }
        }

        @Test
        void textFieldProducesWidgetCoordinates() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("firstName");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<stirling.software.common.model.FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(1, fields.size());
                stirling.software.common.model.FormFieldWithCoordinates field = fields.get(0);
                assertEquals("firstName", field.getName());
                assertEquals("text", field.getType());
                assertNotNull(field.getWidgets());
                assertEquals(1, field.getWidgets().size());
                stirling.software.common.model.FormFieldWithCoordinates.WidgetCoordinates wc =
                        field.getWidgets().get(0);
                assertEquals(0, wc.getPageIndex());
                // x is relative to crop-box origin (0 here), so it equals the lower-left x.
                assertEquals(50f, wc.getX(), 0.01f);
                assertEquals(200f, wc.getWidth(), 0.01f);
                assertEquals(20f, wc.getHeight(), 0.01f);
            }
        }

        @Test
        void multipleFieldsAreSortedTopToBottom() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);

                PDTextField lower = new PDTextField(setup.acroForm());
                lower.setPartialName("lower");
                attachWidget(setup, lower, new PDRectangle(50, 100, 200, 20));

                PDTextField upper = new PDTextField(setup.acroForm());
                upper.setPartialName("upper");
                attachWidget(setup, upper, new PDRectangle(50, 700, 200, 20));

                List<stirling.software.common.model.FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(2, fields.size());
                // The widget higher on the page (smaller CSS-y after flip) sorts first.
                assertEquals("upper", fields.get(0).getName());
                assertEquals("lower", fields.get(1).getName());
            }
        }
    }

    // ----------------------------------------------------------------------
    // repairMissingWidgetPageReferences
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("repairMissingWidgetPageReferences")
    class RepairMissingWidgetPageReferences {

        @Test
        void nullDocumentDoesNotThrow() {
            FormUtils.repairMissingWidgetPageReferences(null);
        }

        @Test
        void documentWithoutAcroFormDoesNotThrow() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                FormUtils.repairMissingWidgetPageReferences(doc);
            }
        }

        @Test
        void setsPageReferenceForOrphanWidget() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("orphan");

                // Build a widget that is on the page's annotation list but has no /P page ref.
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setRectangle(new PDRectangle(10, 10, 100, 20));
                List<PDAnnotationWidget> widgets = new ArrayList<>(text.getWidgets());
                widgets.add(widget);
                text.setWidgets(widgets);
                setup.acroForm().getFields().add(text);
                setup.page().getAnnotations().add(widget);

                assertNull(widget.getPage());
                FormUtils.repairMissingWidgetPageReferences(doc);
                assertNotNull(widget.getPage());
            }
        }
    }

    // ----------------------------------------------------------------------
    // deleteFormFields
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("deleteFormFields")
    class DeleteFormFields {

        @Test
        void nullDocumentIsNoOp() {
            FormUtils.deleteFormFields(null, List.of("a"));
        }

        @Test
        void nullNamesIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                createBasicDocument(doc);
                FormUtils.deleteFormFields(doc, null);
            }
        }

        @Test
        void emptyNamesIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                createBasicDocument(doc);
                FormUtils.deleteFormFields(doc, List.of());
            }
        }

        @Test
        void removesNamedField() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField keep = new PDTextField(setup.acroForm());
                keep.setPartialName("keep");
                attachWidget(setup, keep, new PDRectangle(50, 700, 200, 20));

                PDTextField remove = new PDTextField(setup.acroForm());
                remove.setPartialName("remove");
                attachWidget(setup, remove, new PDRectangle(50, 660, 200, 20));

                FormUtils.deleteFormFields(doc, List.of("remove"));

                List<FormUtils.FormFieldInfo> remaining = FormUtils.extractFormFields(doc);
                assertEquals(1, remaining.size());
                assertEquals("keep", remaining.get(0).name());
            }
        }

        @Test
        void unknownFieldNameIsIgnored() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField keep = new PDTextField(setup.acroForm());
                keep.setPartialName("keep");
                attachWidget(setup, keep, new PDRectangle(50, 700, 200, 20));

                FormUtils.deleteFormFields(doc, List.of("doesNotExist", "  ", "keep"));
                assertTrue(FormUtils.extractFormFields(doc).isEmpty());
            }
        }
    }

    // ----------------------------------------------------------------------
    // modifyFormFields
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("modifyFormFields")
    class ModifyFormFields {

        @Test
        void nullDocumentIsNoOp() {
            FormUtils.modifyFormFields(null, List.of());
        }

        @Test
        void nullModificationsIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                createBasicDocument(doc);
                FormUtils.modifyFormFields(doc, null);
            }
        }

        @Test
        void emptyModificationsIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                createBasicDocument(doc);
                FormUtils.modifyFormFields(doc, List.of());
            }
        }

        @Test
        void inPlaceRenameAndLabelUpdate() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("oldName");
                text.setDefaultAppearance("/Helv 12 Tf 0 g");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "oldName",
                                "newName",
                                "New Label",
                                null, // keep type (text) -> in-place path
                                Boolean.TRUE,
                                null,
                                null,
                                null,
                                null);

                FormUtils.modifyFormFields(doc, List.of(mod));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                assertEquals("newName", fields.get(0).name());
                assertEquals("New Label", fields.get(0).label());
                assertTrue(fields.get(0).required());
            }
        }

        @Test
        void unknownTargetIsSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("present");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "missing", null, null, null, null, null, null, null, null);

                FormUtils.modifyFormFields(doc, List.of(mod));

                // Untouched field remains.
                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                assertEquals("present", fields.get(0).name());
            }
        }

        @Test
        void nullEntriesAndBlankTargetsAreSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("present");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.ModifyFormFieldDefinition> mods = new ArrayList<>();
                mods.add(null);
                mods.add(
                        new FormUtils.ModifyFormFieldDefinition(
                                "  ", null, null, null, null, null, null, null, null));

                FormUtils.modifyFormFields(doc, mods);
                assertEquals(1, FormUtils.extractFormFields(doc).size());
            }
        }
    }

    // ----------------------------------------------------------------------
    // pruneOrphanedFormFields
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("pruneOrphanedFormFields")
    class PruneOrphanedFormFields {

        @Test
        void nullDocumentIsNoOp() {
            FormUtils.pruneOrphanedFormFields(null);
        }

        @Test
        void documentWithoutAcroFormIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                FormUtils.pruneOrphanedFormFields(doc);
                assertNull(doc.getDocumentCatalog().getAcroForm(null));
            }
        }

        @Test
        void keepsFieldsWithLiveWidgets() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("live");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.pruneOrphanedFormFields(doc);

                PDAcroForm form = doc.getDocumentCatalog().getAcroForm(null);
                assertNotNull(form);
                assertEquals(1, form.getFields().size());
            }
        }

        @Test
        void dropsAcroFormWhenAllWidgetsOrphaned() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("orphan");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                // Remove the widget from the page so it is no longer "live".
                setup.page().getAnnotations().clear();

                FormUtils.pruneOrphanedFormFields(doc);

                assertNull(doc.getDocumentCatalog().getAcroForm(null));
            }
        }
    }

    // ----------------------------------------------------------------------
    // hasAnyRotatedPage (rotated branch)
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("hasAnyRotatedPage")
    class HasAnyRotatedPage {

        @Test
        void rotatedPageDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage();
                page.setRotation(90);
                doc.addPage(page);
                assertTrue(FormUtils.hasAnyRotatedPage(doc));
            }
        }

        @Test
        void unrotatedPageNotDetected() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                assertFalse(FormUtils.hasAnyRotatedPage(doc));
            }
        }
    }
}
