package stirling.software.proprietary.util;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceCharacteristicsDictionary;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDChoice;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public enum FormFieldTypeSupport {
    TEXT("text", "textField", PDTextField.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            PDTextField textField = new PDTextField(acroForm);
            textField.setDefaultAppearance("/Helv 12 Tf 0 g");
            return textField;
        }

        @Override
        void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
            PDTextField src = (PDTextField) source;
            PDTextField dst = (PDTextField) target;
            String value = src.getValueAsString();
            if (value != null) {
                dst.setValue(value);
            }
        }

        @Override
        boolean doesNotsupportsDefinitionCreation() {
            return false;
        }

        @Override
        void applyNewFieldDefinition(
                PDTerminalField field,
                FormUtils.NewFormFieldDefinition definition,
                List<String> options)
                throws IOException {
            PDTextField textField = (PDTextField) field;
            String defaultValue = Optional.ofNullable(definition.defaultValue()).orElse("");
            if (!defaultValue.isBlank()) {
                FormUtils.setTextValue(textField, defaultValue);
            }
        }
    },
    CHECKBOX("checkbox", "checkBox", PDCheckBox.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDCheckBox(acroForm);
        }

        @Override
        void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
            PDCheckBox src = (PDCheckBox) source;
            PDCheckBox dst = (PDCheckBox) target;
            if (src.isChecked()) {
                dst.check();
            } else {
                dst.unCheck();
            }
        }

        @Override
        boolean doesNotsupportsDefinitionCreation() {
            return false;
        }

        @Override
        void applyNewFieldDefinition(
                PDTerminalField field,
                FormUtils.NewFormFieldDefinition definition,
                List<String> options)
                throws IOException {
            PDCheckBox checkBox = (PDCheckBox) field;

            if (!options.isEmpty()) {
                checkBox.setExportValues(options);
            }

            ensureCheckBoxAppearance(checkBox);

            if (FormUtils.isChecked(definition.defaultValue())) {
                checkBox.check();
            } else {
                checkBox.unCheck();
            }
        }

        private static void ensureCheckBoxAppearance(PDCheckBox checkBox) {
            try {
                if (checkBox.getWidgets().isEmpty()) {
                    return;
                }

                PDAnnotationWidget widget = checkBox.getWidgets().get(0);

                PDAppearanceCharacteristicsDictionary appearanceChars =
                        widget.getAppearanceCharacteristics();
                if (appearanceChars == null) {
                    appearanceChars =
                            new PDAppearanceCharacteristicsDictionary(widget.getCOSObject());
                    widget.setAppearanceCharacteristics(appearanceChars);
                }

                appearanceChars.setBorderColour(
                        new PDColor(new float[] {0, 0, 0}, PDDeviceRGB.INSTANCE));
                appearanceChars.setBackground(
                        new PDColor(new float[] {1, 1, 1}, PDDeviceRGB.INSTANCE));

                appearanceChars.setNormalCaption("4");

                widget.setPrinted(true);
                widget.setReadOnly(false);
                widget.setHidden(false);

            } catch (Exception e) {
                log.debug("Unable to set checkbox appearance characteristics: {}", e.getMessage());
            }
        }
    },
    RADIO("radio", "radioButton", PDRadioButton.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDRadioButton(acroForm);
        }

        @Override
        void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
            PDRadioButton src = (PDRadioButton) source;
            PDRadioButton dst = (PDRadioButton) target;
            if (src.getExportValues() != null) {
                dst.setExportValues(src.getExportValues());
            }
            if (src.getValue() != null) {
                dst.setValue(src.getValue());
            }
        }
    },
    COMBOBOX("combobox", "comboBox", PDComboBox.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDComboBox(acroForm);
        }

        @Override
        void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
            PDComboBox src = (PDComboBox) source;
            PDComboBox dst = (PDComboBox) target;
            copyChoiceCharacteristics(src, dst);
            if (src.getOptions() != null) {
                dst.setOptions(src.getOptions());
            }
            if (src.getValue() != null && !src.getValue().isEmpty()) {
                dst.setValue(src.getValue());
            }
        }

        @Override
        boolean doesNotsupportsDefinitionCreation() {
            return false;
        }

        @Override
        void applyNewFieldDefinition(
                PDTerminalField field,
                FormUtils.NewFormFieldDefinition definition,
                List<String> options)
                throws IOException {
            PDComboBox comboBox = (PDComboBox) field;
            if (!options.isEmpty()) {
                comboBox.setOptions(options);
            }
            List<String> allowedOptions = FormUtils.resolveOptions(comboBox);
            String comboName =
                    Optional.ofNullable(comboBox.getFullyQualifiedName())
                            .orElseGet(comboBox::getPartialName);
            String defaultValue = definition.defaultValue();
            if (defaultValue != null && !defaultValue.isBlank()) {
                String filtered =
                        FormUtils.filterSingleChoiceSelection(
                                defaultValue, allowedOptions, comboName);
                if (filtered != null) {
                    comboBox.setValue(filtered);
                }
            }
        }
    },
    LISTBOX("listbox", "listBox", PDListBox.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDListBox(acroForm);
        }

        @Override
        void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
            PDListBox src = (PDListBox) source;
            PDListBox dst = (PDListBox) target;
            copyChoiceCharacteristics(src, dst);
            if (src.getOptions() != null) {
                dst.setOptions(src.getOptions());
            }
            if (src.getValue() != null && !src.getValue().isEmpty()) {
                dst.setValue(src.getValue());
            }
        }

        @Override
        boolean doesNotsupportsDefinitionCreation() {
            return false;
        }

        @Override
        void applyNewFieldDefinition(
                PDTerminalField field,
                FormUtils.NewFormFieldDefinition definition,
                List<String> options)
                throws IOException {
            PDListBox listBox = (PDListBox) field;
            listBox.setMultiSelect(Boolean.TRUE.equals(definition.multiSelect()));
            if (!options.isEmpty()) {
                listBox.setOptions(options);
            }
            List<String> allowedOptions = FormUtils.collectChoiceAllowedValues(listBox);
            String listBoxName =
                    Optional.ofNullable(listBox.getFullyQualifiedName())
                            .orElseGet(listBox::getPartialName);
            String defaultValue = definition.defaultValue();
            if (defaultValue != null && !defaultValue.isBlank()) {
                if (Boolean.TRUE.equals(definition.multiSelect())) {
                    List<String> selections = FormUtils.parseMultiChoiceSelections(defaultValue);
                    List<String> filtered =
                            FormUtils.filterChoiceSelections(
                                    selections, allowedOptions, listBoxName);
                    if (!filtered.isEmpty()) {
                        listBox.setValue(filtered);
                    }
                } else {
                    String filtered =
                            FormUtils.filterSingleChoiceSelection(
                                    defaultValue, allowedOptions, listBoxName);
                    if (filtered != null) {
                        listBox.setValue(filtered);
                    }
                }
            }
        }
    },
    SIGNATURE("signature", "signature", PDSignatureField.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDSignatureField(acroForm);
        }
    },
    BUTTON("button", "pushButton", PDPushButton.class) {
        @Override
        PDTerminalField createField(PDAcroForm acroForm) {
            return new PDPushButton(acroForm);
        }
    };

    private static final Map<String, FormFieldTypeSupport> BY_TYPE =
            Arrays.stream(values())
                    .collect(
                            Collectors.toUnmodifiableMap(
                                    FormFieldTypeSupport::typeName, Function.identity()));

    private final String typeName;
    private final String fallbackWidgetName;
    private final Class<? extends PDTerminalField> fieldClass;

    FormFieldTypeSupport(
            String typeName,
            String fallbackWidgetName,
            Class<? extends PDTerminalField> fieldClass) {
        this.typeName = typeName;
        this.fallbackWidgetName = fallbackWidgetName;
        this.fieldClass = fieldClass;
    }

    public static FormFieldTypeSupport forField(PDField field) {
        if (field == null) {
            return null;
        }
        for (FormFieldTypeSupport handler : values()) {
            if (handler.fieldClass.isInstance(field)) {
                return handler;
            }
        }
        return null;
    }

    public static FormFieldTypeSupport forTypeName(String typeName) {
        if (typeName == null) {
            return null;
        }
        return BY_TYPE.get(typeName);
    }

    private static void copyChoiceCharacteristics(PDChoice sourceField, PDChoice targetField) {
        if (sourceField == null || targetField == null) {
            return;
        }

        try {
            int flags = sourceField.getCOSObject().getInt(COSName.FF);
            targetField.getCOSObject().setInt(COSName.FF, flags);
        } catch (Exception e) {
            // ignore and continue
        }

        if (sourceField instanceof PDListBox sourceList
                && targetField instanceof PDListBox targetList) {
            try {
                targetList.setMultiSelect(sourceList.isMultiSelect());
            } catch (Exception ignored) {
                // ignore
            }
        }
    }

    String typeName() {
        return typeName;
    }

    String fallbackWidgetName() {
        return fallbackWidgetName;
    }

    abstract PDTerminalField createField(PDAcroForm acroForm);

    void copyFromOriginal(PDTerminalField source, PDTerminalField target) throws IOException {
        // default no-op
    }

    boolean doesNotsupportsDefinitionCreation() {
        return true;
    }

    void applyNewFieldDefinition(
            PDTerminalField field,
            FormUtils.NewFormFieldDefinition definition,
            List<String> options)
            throws IOException {
        // default no-op
    }
}
