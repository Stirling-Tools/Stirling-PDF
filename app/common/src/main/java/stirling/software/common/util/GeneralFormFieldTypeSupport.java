package stirling.software.common.util;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;

import lombok.extern.slf4j.Slf4j;

/**
 * Simplified form field type support for general PDF operations. This is a subset of the full
 * proprietary FormFieldTypeSupport, containing only what's needed for basic form field copying
 * during page operations.
 */
@Slf4j
public enum GeneralFormFieldTypeSupport {
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
            if (src.getOptions() != null) {
                dst.setOptions(src.getOptions());
            }
            if (src.getValue() != null && !src.getValue().isEmpty()) {
                dst.setValue(src.getValue());
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
            if (src.getOptions() != null) {
                dst.setOptions(src.getOptions());
            }
            if (src.getValue() != null && !src.getValue().isEmpty()) {
                dst.setValue(src.getValue());
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

    private final String typeName;
    private final String fallbackWidgetName;
    private final Class<? extends PDTerminalField> fieldClass;

    GeneralFormFieldTypeSupport(
            String typeName,
            String fallbackWidgetName,
            Class<? extends PDTerminalField> fieldClass) {
        this.typeName = typeName;
        this.fallbackWidgetName = fallbackWidgetName;
        this.fieldClass = fieldClass;
    }

    public static GeneralFormFieldTypeSupport forField(PDField field) {
        if (field == null) {
            return null;
        }
        for (GeneralFormFieldTypeSupport handler : values()) {
            if (handler.fieldClass.isInstance(field)) {
                return handler;
            }
        }
        return null;
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
}
