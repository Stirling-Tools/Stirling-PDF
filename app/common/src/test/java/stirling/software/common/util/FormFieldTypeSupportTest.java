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

class FormFieldTypeSupportTest {

    @Test
    void forField_withNull_returnsNull() {
        assertNull(FormFieldTypeSupport.forField(null));
    }

    @Test
    void forField_withTextField_returnsTEXT() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTextField field = new PDTextField(form);
            assertEquals(FormFieldTypeSupport.TEXT, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withCheckBox_returnsCHECKBOX() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDCheckBox field = new PDCheckBox(form);
            assertEquals(FormFieldTypeSupport.CHECKBOX, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withRadioButton_returnsRADIO() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDRadioButton field = new PDRadioButton(form);
            assertEquals(FormFieldTypeSupport.RADIO, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withComboBox_returnsCOMBOBOX() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDComboBox field = new PDComboBox(form);
            assertEquals(FormFieldTypeSupport.COMBOBOX, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withListBox_returnsLISTBOX() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDListBox field = new PDListBox(form);
            assertEquals(FormFieldTypeSupport.LISTBOX, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withSignatureField_returnsSIGNATURE() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDSignatureField field = new PDSignatureField(form);
            assertEquals(FormFieldTypeSupport.SIGNATURE, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forField_withPushButton_returnsBUTTON() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDPushButton field = new PDPushButton(form);
            assertEquals(FormFieldTypeSupport.BUTTON, FormFieldTypeSupport.forField(field));
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void forTypeName_withValidNames_returnsCorrectEnum() {
        assertEquals(FormFieldTypeSupport.TEXT, FormFieldTypeSupport.forTypeName("text"));
        assertEquals(FormFieldTypeSupport.CHECKBOX, FormFieldTypeSupport.forTypeName("checkbox"));
        assertEquals(FormFieldTypeSupport.RADIO, FormFieldTypeSupport.forTypeName("radio"));
        assertEquals(FormFieldTypeSupport.COMBOBOX, FormFieldTypeSupport.forTypeName("combobox"));
        assertEquals(FormFieldTypeSupport.LISTBOX, FormFieldTypeSupport.forTypeName("listbox"));
        assertEquals(FormFieldTypeSupport.SIGNATURE, FormFieldTypeSupport.forTypeName("signature"));
        assertEquals(FormFieldTypeSupport.BUTTON, FormFieldTypeSupport.forTypeName("button"));
    }

    @Test
    void forTypeName_withNull_returnsNull() {
        assertNull(FormFieldTypeSupport.forTypeName(null));
    }

    @Test
    void forTypeName_withUnknown_returnsNull() {
        assertNull(FormFieldTypeSupport.forTypeName("unknown"));
    }

    @Test
    void doesNotSupportsDefinitionCreation_textReturnsFalse() {
        assertFalse(FormFieldTypeSupport.TEXT.doesNotsupportsDefinitionCreation());
    }

    @Test
    void doesNotSupportsDefinitionCreation_radioReturnsTrue() {
        assertTrue(FormFieldTypeSupport.RADIO.doesNotsupportsDefinitionCreation());
    }

    @Test
    void doesNotSupportsDefinitionCreation_signatureReturnsTrue() {
        assertTrue(FormFieldTypeSupport.SIGNATURE.doesNotsupportsDefinitionCreation());
    }

    @Test
    void doesNotSupportsDefinitionCreation_buttonReturnsTrue() {
        assertTrue(FormFieldTypeSupport.BUTTON.doesNotsupportsDefinitionCreation());
    }

    @Test
    void createField_text_returnsPDTextField() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTerminalField field = FormFieldTypeSupport.TEXT.createField(form);
            assertInstanceOf(PDTextField.class, field);
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }

    @Test
    void createField_checkbox_returnsPDCheckBox() {
        try (PDDocument doc = new PDDocument()) {
            PDAcroForm form = new PDAcroForm(doc);
            PDTerminalField field = FormFieldTypeSupport.CHECKBOX.createField(form);
            assertInstanceOf(PDCheckBox.class, field);
        } catch (Exception e) {
            fail("Unexpected exception: " + e.getMessage());
        }
    }
}
