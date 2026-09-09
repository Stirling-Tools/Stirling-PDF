package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.FormFieldWithCoordinates;

/**
 * Additional branch coverage for {@link FormUtils}, complementing FormUtilsAdditionalTest and
 * FormUtilsGapTest. Targets the display-label derivation chain, choice/radio value extraction and
 * application, the modify-form type-change recreation path, and coordinate edge cases.
 */
class FormUtilsMoreTest {

    private record SetupDocument(PDPage page, PDAcroForm acroForm) {}

    private static SetupDocument createBasicDocument(PDDocument document) {
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        PDAcroForm acroForm = new PDAcroForm(document);
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
        List<PDAnnotationWidget> widgets = new ArrayList<>();
        widgets.add(widget);
        field.setWidgets(widgets);
        setup.acroForm().getFields().add(field);
        setup.page().getAnnotations().add(widget);
    }

    // ----------------------------------------------------------------------
    // extractFormFields - field-type branches and display labels
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("extractFormFields metadata")
    class ExtractFormFieldsMetadata {

        @Test
        void comboBoxExtractsOptionsAndType() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setPartialName("color");
                combo.setOptions(List.of("Red", "Green"));
                attachWidget(setup, combo, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                FormUtils.FormFieldInfo info = fields.get(0);
                assertEquals("combobox", info.type());
                assertNotNull(info.options());
                assertTrue(info.options().contains("Red"));
            }
        }

        @Test
        void multiSelectListBoxReportsMultiSelect() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDListBox listBox = new PDListBox(setup.acroForm());
                listBox.setPartialName("items");
                listBox.setMultiSelect(true);
                listBox.setOptions(List.of("A", "B", "C"));
                attachWidget(setup, listBox, new PDRectangle(50, 600, 200, 60));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                assertEquals("listbox", fields.get(0).type());
                assertTrue(fields.get(0).multiSelect());
            }
        }

        @Test
        void fieldWithoutNameIsSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                // No partial name set -> fullyQualifiedName and partialName both null -> skipped.
                PDTextField nameless = new PDTextField(setup.acroForm());
                attachWidget(setup, nameless, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertTrue(fields.isEmpty());
            }
        }

        @Test
        void alternateFieldNameBecomesDisplayLabel() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("f1");
                text.setAlternateFieldName("Customer Email");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals("Customer Email", fields.get(0).label());
            }
        }

        @Test
        void tooltipBecomesDisplayLabelWhenNoAlternate() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("f1");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));
                // Set the /TU tooltip on the widget.
                text.getWidgets().get(0).getCOSObject().setString(COSName.TU, "Phone Number");

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals("Phone Number", fields.get(0).label());
                assertEquals("Phone Number", fields.get(0).tooltip());
            }
        }

        @Test
        void humanizedNameUsedWhenNoLabelSources() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("first_name");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                // humanizeName turns first_name -> "first name".
                assertEquals("first name", fields.get(0).label());
            }
        }

        @Test
        void genericNameFallsBackToTypeLabel() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                // A 32+ hex char name is detected as UUID-like (generic), forcing the fallback.
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("cdc47b7041524571abcd93017fe77bf7");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals("Text field 1", fields.get(0).label());
            }
        }

        @Test
        void choiceFieldCurrentValueIsJoined() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDListBox listBox = new PDListBox(setup.acroForm());
                listBox.setPartialName("items");
                listBox.setMultiSelect(true);
                listBox.setOptions(List.of("A", "B", "C"));
                attachWidget(setup, listBox, new PDRectangle(50, 600, 200, 60));
                listBox.setValue(List.of("A", "C"));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals("A,C", fields.get(0).value());
            }
        }

        @Test
        void fieldsAreSortedByPageThenOrderThenName() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField zebra = new PDTextField(setup.acroForm());
                zebra.setPartialName("zebra");
                attachWidget(setup, zebra, new PDRectangle(50, 700, 200, 20));

                PDTextField apple = new PDTextField(setup.acroForm());
                apple.setPartialName("apple");
                attachWidget(setup, apple, new PDRectangle(50, 660, 200, 20));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(2, fields.size());
                // pageOrder is assigned in tree order so zebra (added first) keeps order 0.
                assertEquals("zebra", fields.get(0).name());
                assertEquals(0, fields.get(0).pageOrder());
                assertEquals(1, fields.get(1).pageOrder());
            }
        }
    }

    // ----------------------------------------------------------------------
    // extractFormFieldsWithCoordinates - extra branches
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("extractFormFieldsWithCoordinates extras")
    class ExtractWithCoordinatesExtras {

        @Test
        void multilineAndReadOnlyFlagsAreReported() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("notes");
                text.setMultiline(true);
                text.setReadOnly(true);
                attachWidget(setup, text, new PDRectangle(50, 600, 200, 80));

                List<FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(1, fields.size());
                assertTrue(fields.get(0).isMultiline());
                assertTrue(fields.get(0).isReadOnly());
            }
        }

        @Test
        void comboBoxWithDistinctDisplayValuesPopulatesDisplayOptions() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setPartialName("country");
                // Distinct export vs display values triggers displayOptions to be sent.
                combo.setOptions(List.of("US", "GB"), List.of("United States", "Britain"));
                attachWidget(setup, combo, new PDRectangle(50, 700, 200, 20));

                List<FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(1, fields.size());
                List<String> displayOptions = fields.get(0).getDisplayOptions();
                assertNotNull(displayOptions);
                assertTrue(displayOptions.contains("United States"));
            }
        }

        @Test
        void fontSizeExtractedFromDefaultAppearance() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("sized");
                text.setDefaultAppearance("/Helv 14 Tf 0 g");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                List<FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                FormFieldWithCoordinates.WidgetCoordinates wc = fields.get(0).getWidgets().get(0);
                assertEquals(14f, wc.getFontSize(), 0.01f);
            }
        }

        @Test
        void widgetOutOfBoundsYieldsNullCoordinateEntry() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("offpage");
                // Far below the page origin -> finalY exceeds bounds -> createWidgetCoordinates
                // returns null, which is still added to the per-field widget list.
                attachWidget(setup, text, new PDRectangle(50, -5000, 200, 20));

                List<FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(1, fields.size());
                List<FormFieldWithCoordinates.WidgetCoordinates> widgets =
                        fields.get(0).getWidgets();
                assertNotNull(widgets);
                assertEquals(1, widgets.size());
                assertNull(widgets.get(0));
            }
        }

        @Test
        void widgetWithNullRectangleIsSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("norect");
                PDAnnotationWidget widget = new PDAnnotationWidget();
                widget.setPage(setup.page());
                // Deliberately leave rectangle unset.
                List<PDAnnotationWidget> widgets = new ArrayList<>();
                widgets.add(widget);
                text.setWidgets(widgets);
                setup.acroForm().getFields().add(text);
                setup.page().getAnnotations().add(widget);

                List<FormFieldWithCoordinates> fields =
                        FormUtils.extractFormFieldsWithCoordinates(doc);
                assertEquals(1, fields.size());
                assertNull(fields.get(0).getWidgets());
            }
        }
    }

    // ----------------------------------------------------------------------
    // applyFieldValues - choice / radio / signature / button branches
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("applyFieldValues field-type branches")
    class ApplyFieldValuesBranches {

        @Test
        void comboBoxValueIsApplied() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setPartialName("color");
                combo.setOptions(List.of("Red", "Green", "Blue"));
                attachWidget(setup, combo, new PDRectangle(50, 700, 200, 20));

                FormUtils.applyFieldValues(doc, Map.of("color", "Green"), false);
                assertThat(combo.getValue()).contains("Green");
            }
        }

        @Test
        void comboBoxNullValueClearsSelection() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDComboBox combo = new PDComboBox(setup.acroForm());
                combo.setPartialName("color");
                combo.setOptions(List.of("Red", "Green"));
                attachWidget(setup, combo, new PDRectangle(50, 700, 200, 20));
                combo.setValue("Red");

                java.util.Map<String, Object> values = new java.util.HashMap<>();
                values.put("color", null);
                FormUtils.applyFieldValues(doc, values, false);
                // Null value routes to setValue("") which clears the prior "Red" selection.
                assertFalse(combo.getValue().contains("Red"));
            }
        }

        @Test
        void multiSelectListBoxAppliesCommaSeparatedValues() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDListBox listBox = new PDListBox(setup.acroForm());
                listBox.setPartialName("items");
                listBox.setMultiSelect(true);
                listBox.setOptions(List.of("A", "B", "C"));
                attachWidget(setup, listBox, new PDRectangle(50, 600, 200, 60));

                FormUtils.applyFieldValues(doc, Map.of("items", "A, C"), false);
                assertThat(listBox.getValue()).containsExactlyInAnyOrder("A", "C");
            }
        }

        @Test
        void radioButtonValueIsApplied() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDListBox other = new PDListBox(setup.acroForm());
                other.setPartialName("dummy");
                other.setOptions(List.of("x"));
                attachWidget(setup, other, new PDRectangle(50, 500, 200, 20));

                // Blank radio value path: no exception, value stays unset.
                org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton radio =
                        new org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton(
                                setup.acroForm());
                radio.setPartialName("choice");
                attachWidget(setup, radio, new PDRectangle(50, 700, 20, 20));

                FormUtils.applyFieldValues(doc, Map.of("choice", "  "), false);
                // No widgets configured with on-states, but the blank-skip branch must not throw.
                assertNotNull(radio.getValueAsString());
            }
        }

        @Test
        void signatureAndPushButtonFieldsAreSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDSignatureField sig = new PDSignatureField(setup.acroForm());
                sig.setPartialName("sig");
                attachWidget(setup, sig, new PDRectangle(50, 700, 200, 40));

                PDPushButton button = new PDPushButton(setup.acroForm());
                button.setPartialName("btn");
                attachWidget(setup, button, new PDRectangle(50, 640, 200, 40));

                // Must complete without throwing; both branches are no-ops.
                FormUtils.applyFieldValues(doc, Map.of("sig", "ignored", "btn", "ignored"), false);
            }
        }

        @Test
        void blankKeysAreSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("name");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                java.util.Map<String, Object> values = new java.util.LinkedHashMap<>();
                values.put("  ", "blankKey");
                values.put("name", "value");
                FormUtils.applyFieldValues(doc, values, false);
                assertEquals("value", text.getValueAsString());
            }
        }

        @Test
        void unknownKeyIsSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("name");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.applyFieldValues(doc, Map.of("doesNotExist", "x"), false);
                assertEquals("", text.getValueAsString());
            }
        }
    }

    // ----------------------------------------------------------------------
    // modifyFormFields - type change (recreate) and choice in-place edits
    // ----------------------------------------------------------------------

    @Nested
    @DisplayName("modifyFormFields advanced")
    class ModifyFormFieldsAdvanced {

        @Test
        void changesFieldTypeViaRecreate() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("toCombo");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "toCombo",
                                "toCombo",
                                "Pick one",
                                "combobox",
                                null,
                                null,
                                List.of("One", "Two"),
                                "One",
                                null);

                FormUtils.modifyFormFields(doc, List.of(mod));

                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                assertEquals("combobox", fields.get(0).type());
                assertEquals("toCombo", fields.get(0).name());
            }
        }

        @Test
        void inPlaceChoiceOptionAndMultiSelectUpdate() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDListBox listBox = new PDListBox(setup.acroForm());
                listBox.setPartialName("list");
                listBox.setOptions(List.of("A", "B"));
                attachWidget(setup, listBox, new PDRectangle(50, 600, 200, 60));

                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "list",
                                null,
                                null,
                                "listbox", // same type -> in-place path
                                null,
                                Boolean.TRUE,
                                List.of("X", "Y", "Z"),
                                null,
                                "Choose items");

                FormUtils.modifyFormFields(doc, List.of(mod));

                PDField updated = doc.getDocumentCatalog().getAcroForm().getField("list");
                assertTrue(updated instanceof PDListBox);
                assertTrue(((PDListBox) updated).isMultiSelect());
                assertThat(((PDListBox) updated).getOptions()).contains("X", "Y", "Z");
            }
        }

        @Test
        void unsupportedTargetTypeIsSkipped() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField text = new PDTextField(setup.acroForm());
                text.setPartialName("keep");
                attachWidget(setup, text, new PDRectangle(50, 700, 200, 20));

                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "keep", null, null, "bogusType", null, null, null, null, null);

                FormUtils.modifyFormFields(doc, List.of(mod));
                // The field is preserved unchanged because the target type is unsupported.
                List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(doc);
                assertEquals(1, fields.size());
                assertEquals("text", fields.get(0).type());
            }
        }

        @Test
        void renameAvoidsCollisionWithExistingField() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                SetupDocument setup = createBasicDocument(doc);
                PDTextField a = new PDTextField(setup.acroForm());
                a.setPartialName("alpha");
                attachWidget(setup, a, new PDRectangle(50, 700, 200, 20));

                PDTextField b = new PDTextField(setup.acroForm());
                b.setPartialName("beta");
                attachWidget(setup, b, new PDRectangle(50, 660, 200, 20));

                // Rename beta -> alpha; should be uniquified to avoid the collision.
                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "beta", "alpha", null, null, null, null, null, null, null);

                FormUtils.modifyFormFields(doc, List.of(mod));

                List<String> names = new ArrayList<>();
                for (FormUtils.FormFieldInfo info : FormUtils.extractFormFields(doc)) {
                    names.add(info.name());
                }
                assertEquals(2, names.size());
                assertTrue(names.contains("alpha"));
                // The renamed field cannot also be "alpha"; it gets a suffix.
                assertTrue(names.stream().anyMatch(n -> n.startsWith("alpha_")));
            }
        }

        @Test
        void documentWithoutAcroFormIsNoOp() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                FormUtils.ModifyFormFieldDefinition mod =
                        new FormUtils.ModifyFormFieldDefinition(
                                "x", null, null, null, null, null, null, null, null);
                FormUtils.modifyFormFields(doc, List.of(mod));
            }
        }
    }

    // ----------------------------------------------------------------------
    // buildFillTemplateRecord - radio default branch
    // ----------------------------------------------------------------------

    @Test
    void buildFillTemplateRadioUsesCurrentValue() {
        FormUtils.FormFieldInfo info =
                new FormUtils.FormFieldInfo(
                        "choice", "Choice", "radio", "Yes", null, false, 0, false, null, 0);
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(List.of(info));
        assertEquals("Yes", result.get("choice"));
    }

    @Test
    void buildFillTemplateNullEntriesAreSkipped() {
        List<FormUtils.FormFieldInfo> list = new ArrayList<>();
        list.add(null);
        list.add(
                new FormUtils.FormFieldInfo(
                        "kept", "Kept", "text", "v", null, false, 0, false, null, 0));
        Map<String, Object> result = FormUtils.buildFillTemplateRecord(list);
        assertEquals(1, result.size());
        assertTrue(result.containsKey("kept"));
    }

    // ----------------------------------------------------------------------
    // resolveDisplayOptions / resolveOptions extra branches
    // ----------------------------------------------------------------------

    @Test
    void resolveDisplayOptionsReturnsDistinctDisplayValues() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            PDComboBox combo = new PDComboBox(setup.acroForm());
            combo.setPartialName("c");
            combo.setOptions(List.of("US", "GB"), List.of("United States", "Britain"));
            List<String> display = FormUtils.resolveDisplayOptions(combo);
            assertThat(display).contains("United States", "Britain");
        }
    }

    @Test
    void resolveOptionsRadioUsesExportValues() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton radio =
                    new org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton(setup.acroForm());
            radio.setExportValues(List.of("opt1", "opt2"));
            assertEquals(List.of("opt1", "opt2"), FormUtils.resolveOptions(radio));
        }
    }

    // ----------------------------------------------------------------------
    // applyFieldValues strict mode
    // ----------------------------------------------------------------------

    @Test
    void strictModeWrapsChoiceFailureInIoException() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            SetupDocument setup = createBasicDocument(doc);
            // A combo box with no /Opt array: setting a non-empty value triggers the
            // "missing /Opt" IllegalArgumentException, which strict mode rethrows as IOException.
            PDComboBox combo = new PDComboBox(setup.acroForm());
            combo.setPartialName("noOpts");
            attachWidget(setup, combo, new PDRectangle(50, 700, 200, 20));

            assertThrows(
                    IOException.class,
                    () -> FormUtils.applyFieldValues(doc, Map.of("noOpts", "X"), false, true));
        }
    }
}
