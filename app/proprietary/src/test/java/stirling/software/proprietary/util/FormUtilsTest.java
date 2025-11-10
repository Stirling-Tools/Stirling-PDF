package stirling.software.proprietary.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

@Disabled("Covered by integration workflow; unit assertions no longer reflect runtime behavior")
class FormUtilsTest {

    private static SetupDocument createBasicDocument(PDDocument document) throws IOException {
        PDPage page = new PDPage();
        document.addPage(page);

        PDAcroForm acroForm = new PDAcroForm(document);
        acroForm.setDefaultResources(new PDResources());
        acroForm.setNeedAppearances(true);
        document.getDocumentCatalog().setAcroForm(acroForm);

        return new SetupDocument(page, acroForm);
    }

    private static void attachField(SetupDocument setup, PDTextField field, PDRectangle rectangle)
            throws IOException {
        attachWidget(setup, field, rectangle);
    }

    private static void attachField(SetupDocument setup, PDCheckBox field, PDRectangle rectangle)
            throws IOException {
        field.setExportValues(List.of("Yes"));
        attachWidget(setup, field, rectangle);
    }

    private static void attachWidget(
            SetupDocument setup,
            org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField field,
            PDRectangle rectangle)
            throws IOException {
        PDAnnotationWidget widget = new PDAnnotationWidget();
        widget.setRectangle(rectangle);
        widget.setPage(setup.page);
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null) {
            widgets = new ArrayList<>();
        } else {
            widgets = new ArrayList<>(widgets);
        }
        widgets.add(widget);
        field.setWidgets(widgets);
        setup.acroForm.getFields().add(field);
        setup.page.getAnnotations().add(widget);
    }

    @Test
    void extractFormFieldsReturnsFieldMetadata() throws IOException {
        try (PDDocument document = new PDDocument()) {
            SetupDocument setup = createBasicDocument(document);

            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("firstName");
            attachField(setup, textField, new PDRectangle(50, 700, 200, 20));

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(document);
            assertEquals(1, fields.size());
            FormUtils.FormFieldInfo info = fields.get(0);
            assertEquals("firstName", info.name());
            assertEquals("text", info.type());
            assertEquals(0, info.pageIndex());
            assertEquals("", info.value());
        }
    }

    @Test
    void applyFieldValuesPopulatesTextAndCheckbox() throws IOException {
        try (PDDocument document = new PDDocument()) {
            SetupDocument setup = createBasicDocument(document);

            PDTextField textField = new PDTextField(setup.acroForm);
            textField.setPartialName("company");
            attachField(setup, textField, new PDRectangle(60, 720, 220, 20));

            PDCheckBox checkBox = new PDCheckBox(setup.acroForm);
            checkBox.setPartialName("subscribed");
            attachField(setup, checkBox, new PDRectangle(60, 680, 16, 16));

            FormUtils.applyFieldValues(
                    document, Map.of("company", "Stirling", "subscribed", true), false);

            assertEquals("Stirling", textField.getValueAsString());
            assertTrue(checkBox.isChecked());

            FormUtils.applyFieldValues(document, Map.of("subscribed", false), false);
            assertFalse(checkBox.isChecked());
            assertEquals("Off", checkBox.getValue());
        }
    }

    private record SetupDocument(PDPage page, PDAcroForm acroForm) {}
}
