package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.Test;

public class FormUtilsTest {

    @Test
    void hasAnyRotatedPageDetectsRotation() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage firstPage = new PDPage(PDRectangle.LETTER);
            PDPage secondPage = new PDPage(PDRectangle.LETTER);
            document.addPage(firstPage);
            document.addPage(secondPage);

            assertFalse(
                    FormUtils.hasAnyRotatedPage(document),
                    "Document without rotation should not report rotated pages.");

            secondPage.setRotation(180);

            assertTrue(
                    FormUtils.hasAnyRotatedPage(document),
                    "Document with a rotated page should report rotation.");
        }
    }

    @Test
    void copyAndTransformFormFieldsCopiesTextFieldsWithScaling() throws Exception {
        try (PDDocument sourceDocument = new PDDocument();
                PDDocument targetDocument = new PDDocument()) {
            PDPage sourcePage = new PDPage(PDRectangle.LETTER);
            PDPage destinationPage = new PDPage(PDRectangle.LETTER);
            sourceDocument.addPage(sourcePage);
            targetDocument.addPage(destinationPage);

            PDAcroForm sourceAcroForm = new PDAcroForm(sourceDocument);
            sourceDocument.getDocumentCatalog().setAcroForm(sourceAcroForm);

            PDTextField sourceField = new PDTextField(sourceAcroForm);
            sourceField.setPartialName("customerName");
            setTextValue(sourceField, "Jane Doe");
            sourceAcroForm.getFields().add(sourceField);

            PDAnnotationWidget widget = new PDAnnotationWidget();
            setWidgetRectangle(widget, 10, 20, 120, 40);
            widget.setPage(sourcePage);
            widget.setParent(sourceField);
            sourceField.setWidgets(List.of(widget));
            sourcePage.getAnnotations().add(widget);
            assertNotNull(widget.getCOSObject().getDictionaryObject(COSName.RECT));

            Map<PDAnnotationWidget, PDField> widgetMap = buildWidgetMap(sourceAcroForm);
            assertEquals(1, widgetMap.size(), "Source widget should be associated with its field.");
            assertEquals("customerName", widgetMap.get(widget).getPartialName());

            FormUtils.copyAndTransformFormFields(
                    sourceDocument,
                    targetDocument,
                    1,
                    1,
                    1,
                    1,
                    destinationPage.getMediaBox().getWidth(),
                    destinationPage.getMediaBox().getHeight());

            PDAcroForm targetAcroForm = targetDocument.getDocumentCatalog().getAcroForm();
            assertNotNull(targetAcroForm, "Target document should contain an AcroForm.");

            int copiedSize = targetAcroForm.getFields().size();
            assertEquals(1, copiedSize, "One field should have been copied but was " + copiedSize);
            PDTextField copiedField = (PDTextField) targetAcroForm.getFields().get(0);
            assertEquals("page0_customerName", copiedField.getPartialName());
            assertEquals("Jane Doe", copiedField.getValueAsString());

            PDAnnotationWidget copiedWidget = copiedField.getWidgets().get(0);
            assertNotNull(copiedWidget, "Copied field should contain a widget.");

            List<PDAnnotation> destAnnotations = destinationPage.getAnnotations();
            assertFalse(
                    destAnnotations.isEmpty(), "Destination page should have widget annotations.");
        }
    }

    @Test
    void copyAndTransformFormFieldsGeneratesUniqueFieldNames() throws Exception {
        try (PDDocument sourceDocument = new PDDocument();
                PDDocument targetDocument = new PDDocument()) {
            PDPage sourcePage = new PDPage(PDRectangle.LETTER);
            PDPage destinationPage = new PDPage(PDRectangle.LETTER);
            sourceDocument.addPage(sourcePage);
            targetDocument.addPage(destinationPage);

            PDAcroForm sourceAcroForm = new PDAcroForm(sourceDocument);
            sourceDocument.getDocumentCatalog().setAcroForm(sourceAcroForm);

            PDAnnotationWidget firstWidget =
                    createTextField(sourceAcroForm, sourcePage, "shared", "First");
            PDAnnotationWidget secondWidget =
                    createTextField(sourceAcroForm, sourcePage, "shared", "Second");

            Map<PDAnnotationWidget, PDField> widgetMap = buildWidgetMap(sourceAcroForm);
            assertEquals(
                    2, widgetMap.size(), "Both widgets should be discovered in the field tree.");
            assertEquals("shared", widgetMap.get(firstWidget).getPartialName());
            assertEquals("shared", widgetMap.get(secondWidget).getPartialName());

            FormUtils.copyAndTransformFormFields(
                    sourceDocument,
                    targetDocument,
                    1,
                    1,
                    1,
                    1,
                    destinationPage.getMediaBox().getWidth(),
                    destinationPage.getMediaBox().getHeight());

            PDAcroForm targetAcroForm = targetDocument.getDocumentCatalog().getAcroForm();
            List<PDField> copiedFields = targetAcroForm.getFields();
            assertEquals(
                    2,
                    copiedFields.size(),
                    "Both fields should have been copied but were " + copiedFields.size());

            Set<String> fieldNames =
                    copiedFields.stream().map(PDField::getPartialName).collect(Collectors.toSet());
            assertTrue(fieldNames.contains("page0_shared"));
            assertTrue(fieldNames.contains("page0_shared_1"));

            Set<String> values =
                    copiedFields.stream()
                            .map(field -> ((PDTextField) field).getValueAsString())
                            .collect(Collectors.toSet());
            assertTrue(values.contains("First"));
            assertTrue(values.contains("Second"));
        }
    }

    private static PDAnnotationWidget createTextField(
            PDAcroForm acroForm, PDPage page, String partialName, String value) throws IOException {
        PDTextField field = new PDTextField(acroForm);
        field.setPartialName(partialName);
        setTextValue(field, value);
        acroForm.getFields().add(field);

        PDAnnotationWidget widget = new PDAnnotationWidget();
        setWidgetRectangle(widget, 30, 40, 100, 25);
        widget.setPage(page);
        widget.setParent(field);
        field.setWidgets(List.of(widget));
        page.getAnnotations().add(widget);
        assertNotNull(widget.getCOSObject().getDictionaryObject(COSName.RECT));
        return widget;
    }

    @SuppressWarnings("unchecked")
    private static Map<PDAnnotationWidget, PDField> buildWidgetMap(PDAcroForm acroForm)
            throws Exception {
        Method method = FormUtils.class.getDeclaredMethod("buildWidgetFieldMap", PDAcroForm.class);
        method.setAccessible(true);
        return (Map<PDAnnotationWidget, PDField>) method.invoke(null, acroForm);
    }

    private static void setTextValue(PDTextField field, String value) {
        field.getCOSObject().setString(COSName.V, value);
        field.getCOSObject().setString(COSName.DV, value);
    }

    private static void setWidgetRectangle(
            PDAnnotationWidget widget, float x, float y, float width, float height) {
        widget.setRectangle(new PDRectangle(x, y, width, height));
        COSArray rectArray = new COSArray();
        rectArray.add(new COSFloat(x));
        rectArray.add(new COSFloat(y));
        rectArray.add(new COSFloat(x + width));
        rectArray.add(new COSFloat(y + height));
        widget.getCOSObject().setItem(COSName.RECT, rectArray);
    }
}
