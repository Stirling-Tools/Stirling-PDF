package stirling.software.common.util;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for copying and transforming PDF form fields during page operations. Used by
 * multi-page layout and other page manipulation operations that need to preserve form fields.
 */
@Slf4j
@UtilityClass
public class GeneralFormCopyUtils {

    public boolean hasAnyRotatedPage(PDDocument document) {
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

    public void copyAndTransformFormFields(
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

        // Temporarily set NeedAppearances to true during field creation
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

            if (rowIndex >= rows) {
                continue;
            }

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

        // Generate appearance streams and embed them authoritatively
        boolean appearancesGenerated = false;
        try {
            newAcroForm.refreshAppearances();
            appearancesGenerated = true;
        } catch (NoSuchMethodError nsme) {
            log.warn(
                    "AcroForm.refreshAppearances() not available in this PDFBox version; "
                            + "leaving NeedAppearances=true for viewer-side rendering.");
        } catch (Exception t) {
            log.warn(
                    "Failed to refresh field appearances via AcroForm: {}. "
                            + "Leaving NeedAppearances=true as fallback.",
                    t.getMessage(),
                    t);
        }

        // After successful appearance generation, set NeedAppearances to false
        // to signal that appearance streams are now embedded authoritatively
        if (appearancesGenerated) {
            try {
                newAcroForm.setNeedAppearances(false);
            } catch (Exception e) {
                log.debug(
                        "Failed to set NeedAppearances to false: {}. "
                                + "Appearances were generated but flag could not be updated.",
                        e.getMessage());
            }
        }
    }

    private void copyBasicFormFields(
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
                    if (!(sourceField instanceof PDTerminalField terminalField)) {
                        continue;
                    }

                    GeneralFormFieldTypeSupport handler =
                            GeneralFormFieldTypeSupport.forField(terminalField);
                    if (handler == null) {
                        log.debug(
                                "Skipping unsupported field type '{}' for widget '{}'",
                                sourceField.getClass().getSimpleName(),
                                Optional.ofNullable(sourceField.getFullyQualifiedName())
                                        .orElseGet(sourceField::getPartialName));
                        continue;
                    }

                    copyFieldUsingHandler(
                            handler,
                            terminalField,
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            widgetAnnotation,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);
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

    private void copyFieldUsingHandler(
            GeneralFormFieldTypeSupport handler,
            PDTerminalField sourceField,
            PDAcroForm newAcroForm,
            PDPage destinationPage,
            List<PDAnnotation> destinationAnnotations,
            PDAnnotationWidget sourceWidget,
            float offsetX,
            float offsetY,
            float scale,
            int pageIndex,
            Map<String, Integer> fieldNameCounters) {

        try {
            PDTerminalField newField = handler.createField(newAcroForm);
            boolean initialized =
                    initializeFieldWithWidget(
                            newAcroForm,
                            destinationPage,
                            destinationAnnotations,
                            newField,
                            sourceField.getPartialName(),
                            handler.fallbackWidgetName(),
                            sourceWidget,
                            offsetX,
                            offsetY,
                            scale,
                            pageIndex,
                            fieldNameCounters);

            if (!initialized) {
                return;
            }

            handler.copyFromOriginal(sourceField, newField);
        } catch (Exception e) {
            log.warn(
                    "Failed to copy {} field '{}': {}",
                    handler.typeName(),
                    Optional.ofNullable(sourceField.getFullyQualifiedName())
                            .orElseGet(sourceField::getPartialName),
                    e.getMessage(),
                    e);
        }
    }

    private <T extends PDTerminalField> boolean initializeFieldWithWidget(
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

    private String generateUniqueFieldName(
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

    private Map<PDAnnotationWidget, PDField> buildWidgetFieldMap(PDAcroForm acroForm) {
        Map<PDAnnotationWidget, PDField> map = new HashMap<>();
        if (acroForm == null) {
            return map;
        }
        try {
            for (PDField field : acroForm.getFieldTree()) {
                List<PDAnnotationWidget> widgets = field.getWidgets();
                if (widgets == null) {
                    continue;
                }
                for (PDAnnotationWidget widget : widgets) {
                    if (widget != null) {
                        map.put(widget, field);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to build widget->field map: {}", e.getMessage(), e);
        }
        return map;
    }
}
