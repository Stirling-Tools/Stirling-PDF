package stirling.software.common.util;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.*;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public final class FormUtils {

    private FormUtils() {}

    public static boolean hasAnyRotatedPage(PDDocument document) {
        try {
            for (PDPage page : document.getPages()) {
                int rot = page.getRotation();
                int norm = ((rot % 360) + 360) % 360;
                if (norm != 0) {
                    return true;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to inspect page rotations: {}", e.getMessage(), e);
        }
        return false;
    }

    public static void copyAndTransformFormFields(
            PDDocument sourceDocument,
            PDDocument newDocument,
            int totalPages,
            int pagesPerSheet,
            int cols,
            int rows,
            float cellWidth,
            float cellHeight)
            throws IOException {

        PDDocumentCatalog sourceCatalog = sourceDocument.getDocumentCatalog();
        PDAcroForm sourceAcroForm = sourceCatalog.getAcroForm();

        if (sourceAcroForm == null || sourceAcroForm.getFields().isEmpty()) {
            return;
        }

        PDDocumentCatalog newCatalog = newDocument.getDocumentCatalog();
        PDAcroForm newAcroForm = new PDAcroForm(newDocument);
        newCatalog.setAcroForm(newAcroForm);

        PDResources dr = new PDResources();
        PDType1Font helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        PDType1Font zapfDingbats = new PDType1Font(Standard14Fonts.FontName.ZAPF_DINGBATS);
        dr.put(COSName.getPDFName("Helv"), helvetica);
        dr.put(COSName.getPDFName("ZaDb"), zapfDingbats);
        newAcroForm.setDefaultResources(dr);
        newAcroForm.setDefaultAppearance("/Helv 12 Tf 0 g");

        // Do not mutate the source AcroForm; skip bad widgets during copy
        newAcroForm.setNeedAppearances(true);

        Map<String, Integer> fieldNameCounters = new HashMap<>();

        // Build widget -> field map once for efficient lookups
        Map<PDAnnotationWidget, PDField> widgetFieldMap = buildWidgetFieldMap(sourceAcroForm);

        for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            PDPage sourcePage = sourceDocument.getPage(pageIndex);
            List<PDAnnotation> annotations = sourcePage.getAnnotations();

            if (annotations.isEmpty()) {
                continue;
            }

            int destinationPageIndex = pageIndex / pagesPerSheet;
            int adjustedPageIndex = pageIndex % pagesPerSheet;
            int rowIndex = adjustedPageIndex / cols;
            int colIndex = adjustedPageIndex % cols;

            if (destinationPageIndex >= newDocument.getNumberOfPages()) {
                continue;
            }

            PDPage destinationPage = newDocument.getPage(destinationPageIndex);
            PDRectangle sourceRect = sourcePage.getMediaBox();

            float scaleWidth = cellWidth / sourceRect.getWidth();
            float scaleHeight = cellHeight / sourceRect.getHeight();
            float scale = Math.min(scaleWidth, scaleHeight);

            float x = colIndex * cellWidth + (cellWidth - sourceRect.getWidth() * scale) / 2;
            float y =
                    destinationPage.getMediaBox().getHeight()
                            - ((rowIndex + 1) * cellHeight
                                    - (cellHeight - sourceRect.getHeight() * scale) / 2);

            copyBasicFormFields(
                    sourceAcroForm,
                    newAcroForm,
                    sourcePage,
                    destinationPage,
                    x,
                    y,
                    scale,
                    pageIndex,
                    fieldNameCounters,
                    widgetFieldMap);
        }

        // Refresh appearances to ensure widgets render correctly across viewers
        try {
            // Use reflection to avoid compile-time dependency on PDFBox version
            Method m = newAcroForm.getClass().getMethod("refreshAppearances");
            m.invoke(newAcroForm);
        } catch (NoSuchMethodException nsme) {
            log.warn(
                    "AcroForm.refreshAppearances() not available in this PDFBox version; relying on NeedAppearances.");
        } catch (Throwable t) {
            log.warn("Failed to refresh field appearances via AcroForm: {}", t.getMessage(), t);
        }
    }

    private static void copyBasicFormFields(
            PDAcroForm sourceAcroForm,
            PDAcroForm newAcroForm,
            PDPage sourcePage,
            PDPage destinationPage,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters,
            Map<PDAnnotationWidget, PDField> widgetFieldMap) {

        try {
            List<PDAnnotation> sourceAnnotations = sourcePage.getAnnotations();
            List<PDAnnotation> destinationAnnotations = destinationPage.getAnnotations();

            for (PDAnnotation annotation : sourceAnnotations) {
                if (annotation instanceof PDAnnotationWidget widgetAnnotation) {
                    if (widgetAnnotation.getRectangle() == null) {
                        continue;
                    }
                    PDField sourceField =
                            widgetFieldMap != null ? widgetFieldMap.get(widgetAnnotation) : null;
                    if (sourceField == null) {
                        continue; // skip widgets without a matching field
                    }
                    if (sourceField instanceof PDTextField pdtextfield) {
                        createSimpleTextField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdtextfield,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDCheckBox pdCheckBox) {
                        createSimpleCheckBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdCheckBox,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDRadioButton pdRadioButton) {
                        createSimpleRadioButtonField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdRadioButton,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDComboBox pdComboBox) {
                        createSimpleComboBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdComboBox,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDListBox pdlistbox) {
                        createSimpleListBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdlistbox,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDSignatureField pdSignatureField) {
                        createSimpleSignatureField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdSignatureField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDPushButton pdPushButton) {
                        createSimplePushButtonField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                pdPushButton,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    }
                }
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to copy basic form fields for page {}: {}",
                    pageIndex,
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleTextField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDTextField sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDTextField newTextField = new PDTextField(newAcroForm);
            newTextField.setDefaultAppearance("/Helv 12 Tf 0 g");

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newTextField,
                            sourceField.getPartialName(),
                            "textField",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            if (sourceField.getValueAsString() != null) {
                newTextField.setValue(sourceField.getValueAsString());
            }

        } catch (Exception e) {
            log.warn(
                    "Failed to create text field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleCheckBoxField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDCheckBox sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDCheckBox newCheckBox = new PDCheckBox(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newCheckBox,
                            sourceField.getPartialName(),
                            "checkBox",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            if (sourceField.isChecked()) {
                newCheckBox.check();
            } else {
                newCheckBox.unCheck();
            }

        } catch (Exception e) {
            log.warn(
                    "Failed to create checkbox field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleRadioButtonField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDRadioButton sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDRadioButton newRadioButton = new PDRadioButton(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newRadioButton,
                            sourceField.getPartialName(),
                            "radioButton",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            if (sourceField.getExportValues() != null) {
                newRadioButton.setExportValues(sourceField.getExportValues());
            }
            if (sourceField.getValue() != null) {
                newRadioButton.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to create radio button field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleComboBoxField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDComboBox sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDComboBox newComboBox = new PDComboBox(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newComboBox,
                            sourceField.getPartialName(),
                            "comboBox",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            if (sourceField.getOptions() != null) {
                newComboBox.setOptions(sourceField.getOptions());
            }
            if (sourceField.getValue() != null && !sourceField.getValue().isEmpty()) {
                newComboBox.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to create combo box field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleListBoxField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDListBox sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDListBox newListBox = new PDListBox(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newListBox,
                            sourceField.getPartialName(),
                            "listBox",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            if (sourceField.getOptions() != null) {
                newListBox.setOptions(sourceField.getOptions());
            }
            if (sourceField.getValue() != null && !sourceField.getValue().isEmpty()) {
                newListBox.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to create list box field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimpleSignatureField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDSignatureField sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDSignatureField newSignatureField = new PDSignatureField(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newSignatureField,
                            sourceField.getPartialName(),
                            "signature",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to create signature field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static void createSimplePushButtonField(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDPushButton sourceField,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDPushButton newPushButton = new PDPushButton(newAcroForm);

            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newPushButton,
                            sourceField.getPartialName(),
                            "pushButton",
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

        } catch (Exception e) {
            log.warn(
                    "Failed to create push button field '{}': {}",
                    sourceField.getPartialName(),
                    e.getMessage(),
                    e);
        }
    }

    private static <T extends PDTerminalField> boolean initializeFieldWithWidget(
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            T newField,
            String originalName,
            String fallbackName,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        String baseName = (originalName != null) ? originalName : fallbackName;
        String newFieldName = generateUniqueFieldName(baseName, pageIndex, fieldNameCounters);
        newField.setPartialName(newFieldName);

        PDAnnotationWidget newWidget = new PDAnnotationWidget();
        PDRectangle sourceRect = sourceWidget.getRectangle();
        if (sourceRect == null) {
            return false;
        }

        float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
        float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
        float newWidth = sourceRect.getWidth() * scale;
        float newHeight = sourceRect.getHeight() * scale;
        newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
        newWidget.setPage(destinationPage);

        newField.getWidgets().add(newWidget);
        newWidget.setParent(newField);
        newAcroForm.getFields().add(newField);
        destinationAnnotations.add(newWidget);
        return true;
    }

    private static String generateUniqueFieldName(
            String originalName, int pageIndex, Map<String, Integer> fieldNameCounters) {
        String baseName = "page" + pageIndex + "_" + originalName;

        Integer counter = fieldNameCounters.get(baseName);
        if (counter == null) {
            counter = 0;
        } else {
            counter++;
        }
        fieldNameCounters.put(baseName, counter);

        return counter == 0 ? baseName : baseName + "_" + counter;
    }

    private static Map<PDAnnotationWidget, PDField> buildWidgetFieldMap(PDAcroForm acroForm) {
        Map<PDAnnotationWidget, PDField> map = new HashMap<>();
        if (acroForm == null) {
            return map;
        }
        try {
            for (PDField field : acroForm.getFieldTree()) {
                List<PDAnnotationWidget> widgets = field.getWidgets();
                if (widgets != null) {
                    for (PDAnnotationWidget w : widgets) {
                        if (w != null) {
                            map.put(w, field);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to build widget->field map: {}", e.getMessage(), e);
        }
        return map;
    }
}
