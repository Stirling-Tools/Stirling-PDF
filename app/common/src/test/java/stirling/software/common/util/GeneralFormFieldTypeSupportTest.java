package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

class GeneralFormFieldTypeSupportTest {

    @Test
    void forField_withNull_returnsNull() {
        assertNull(GeneralFormFieldTypeSupport.forField(null));
    }

    @Test
    void forField_withTextField_returnsTEXT() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTextField field = new PDTextField(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.TEXT, GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withCheckBox_returnsCHECKBOX() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDCheckBox field = new PDCheckBox(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.CHECKBOX,
                    GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withRadioButton_returnsRADIO() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDRadioButton field = new PDRadioButton(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.RADIO, GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withComboBox_returnsCOMBOBOX() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDComboBox field = new PDComboBox(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.COMBOBOX,
                    GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withListBox_returnsLISTBOX() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDListBox field = new PDListBox(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.LISTBOX,
                    GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withSignatureField_returnsSIGNATURE() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDSignatureField field = new PDSignatureField(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.SIGNATURE,
                    GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void forField_withPushButton_returnsBUTTON() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDPushButton field = new PDPushButton(form);
            assertEquals(
                    GeneralFormFieldTypeSupport.BUTTON,
                    GeneralFormFieldTypeSupport.forField(field));
        }
    }

    @Test
    void createField_text_returnsPDTextField() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTerminalField field = GeneralFormFieldTypeSupport.TEXT.createField(form);
            assertInstanceOf(PDTextField.class, field);
        }
    }

    @Test
    void createField_checkbox_returnsPDCheckBox() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTerminalField field = GeneralFormFieldTypeSupport.CHECKBOX.createField(form);
            assertInstanceOf(PDCheckBox.class, field);
        }
    }

    @Test
    void createField_signature_returnsPDSignatureField() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTerminalField field = GeneralFormFieldTypeSupport.SIGNATURE.createField(form);
            assertInstanceOf(PDSignatureField.class, field);
        }
    }

    @Test
    void typeName_returnsExpectedValues() {
        assertEquals("text", GeneralFormFieldTypeSupport.TEXT.typeName());
        assertEquals("checkbox", GeneralFormFieldTypeSupport.CHECKBOX.typeName());
        assertEquals("radio", GeneralFormFieldTypeSupport.RADIO.typeName());
        assertEquals("combobox", GeneralFormFieldTypeSupport.COMBOBOX.typeName());
        assertEquals("listbox", GeneralFormFieldTypeSupport.LISTBOX.typeName());
        assertEquals("signature", GeneralFormFieldTypeSupport.SIGNATURE.typeName());
        assertEquals("button", GeneralFormFieldTypeSupport.BUTTON.typeName());
    }

    @Test
    void fallbackWidgetName_returnsExpectedValues() {
        assertEquals("textField", GeneralFormFieldTypeSupport.TEXT.fallbackWidgetName());
        assertEquals("checkBox", GeneralFormFieldTypeSupport.CHECKBOX.fallbackWidgetName());
        assertEquals("radioButton", GeneralFormFieldTypeSupport.RADIO.fallbackWidgetName());
        assertEquals("comboBox", GeneralFormFieldTypeSupport.COMBOBOX.fallbackWidgetName());
        assertEquals("listBox", GeneralFormFieldTypeSupport.LISTBOX.fallbackWidgetName());
        assertEquals("signature", GeneralFormFieldTypeSupport.SIGNATURE.fallbackWidgetName());
        assertEquals("pushButton", GeneralFormFieldTypeSupport.BUTTON.fallbackWidgetName());
    }
}
