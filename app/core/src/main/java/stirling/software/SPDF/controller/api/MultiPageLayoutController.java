package stirling.software.SPDF.controller.api;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDComboBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDListBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.util.Matrix;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.MergeMultiplePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
@Slf4j
public class MultiPageLayoutController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/multi-page-layout", consumes = "multipart/form-data")
    @Operation(
            summary = "Merge multiple pages of a PDF document into a single page",
            description =
                    "This operation takes an input PDF file and the number of pages to merge into a"
                            + " single sheet in the output PDF file. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> mergeMultiplePagesIntoOne(
            @ModelAttribute MergeMultiplePagesRequest request) throws IOException {

        int pagesPerSheet = request.getPagesPerSheet();
        MultipartFile file = request.getFileInput();
        boolean addBorder = Boolean.TRUE.equals(request.getAddBorder());

        if (pagesPerSheet != 2
                && pagesPerSheet != 3
                && pagesPerSheet != (int) Math.sqrt(pagesPerSheet) * Math.sqrt(pagesPerSheet)) {
            throw new IllegalArgumentException("pagesPerSheet must be 2, 3 or a perfect square");
        }

        int cols =
                pagesPerSheet == 2 || pagesPerSheet == 3
                        ? pagesPerSheet
                        : (int) Math.sqrt(pagesPerSheet);
        int rows = pagesPerSheet == 2 || pagesPerSheet == 3 ? 1 : (int) Math.sqrt(pagesPerSheet);

        PDDocument sourceDocument = pdfDocumentFactory.load(file);
        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
        PDPage newPage = new PDPage(PDRectangle.A4);
        newDocument.addPage(newPage);

        int totalPages = sourceDocument.getNumberOfPages();
        float cellWidth = newPage.getMediaBox().getWidth() / cols;
        float cellHeight = newPage.getMediaBox().getHeight() / rows;

        PDPageContentStream contentStream =
                new PDPageContentStream(
                        newDocument, newPage, PDPageContentStream.AppendMode.APPEND, true, true);
        LayerUtility layerUtility = new LayerUtility(newDocument);

        float borderThickness = 1.5f;
        contentStream.setLineWidth(borderThickness);
        contentStream.setStrokingColor(Color.BLACK);

        for (int i = 0; i < totalPages; i++) {
            if (i != 0 && i % pagesPerSheet == 0) {
                contentStream.close();
                newPage = new PDPage(PDRectangle.A4);
                newDocument.addPage(newPage);
                contentStream =
                        new PDPageContentStream(
                                newDocument,
                                newPage,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true);
            }

            PDPage sourcePage = sourceDocument.getPage(i);
            PDRectangle rect = sourcePage.getMediaBox();
            float scaleWidth = cellWidth / rect.getWidth();
            float scaleHeight = cellHeight / rect.getHeight();
            float scale = Math.min(scaleWidth, scaleHeight);

            int adjustedPageIndex = i % pagesPerSheet;
            int rowIndex = adjustedPageIndex / cols;
            int colIndex = adjustedPageIndex % cols;

            float x = colIndex * cellWidth + (cellWidth - rect.getWidth() * scale) / 2;
            float y =
                    newPage.getMediaBox().getHeight()
                            - ((rowIndex + 1) * cellHeight
                                    - (cellHeight - rect.getHeight() * scale) / 2);

            contentStream.saveGraphicsState();
            contentStream.transform(Matrix.getTranslateInstance(x, y));
            contentStream.transform(Matrix.getScaleInstance(scale, scale));

            PDFormXObject formXObject = layerUtility.importPageAsForm(sourceDocument, i);
            contentStream.drawForm(formXObject);

            contentStream.restoreGraphicsState();

            if (addBorder) {
                float borderX = colIndex * cellWidth;
                float borderY = newPage.getMediaBox().getHeight() - (rowIndex + 1) * cellHeight;
                contentStream.addRect(borderX, borderY, cellWidth, cellHeight);
                contentStream.stroke();
            }
        }

        contentStream.close();

        try {
            copyAndTransformFormFields(
                    sourceDocument,
                    newDocument,
                    totalPages,
                    pagesPerSheet,
                    cols,
                    rows,
                    cellWidth,
                    cellHeight);
        } catch (Exception e) {
            log.warn("Failed to copy and transform form fields: {}", e.getMessage(), e);
        }

        sourceDocument.close();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_layoutChanged.pdf");
    }

    private void copyAndTransformFormFields(
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

        cleanupSourceFormFields(sourceAcroForm);

        newAcroForm.setNeedAppearances(true);

        Map<String, Integer> fieldNameCounters = new HashMap<>();

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
                    fieldNameCounters);
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
            Map<String, Integer> fieldNameCounters) {

        try {
            List<PDAnnotation> sourceAnnotations = sourcePage.getAnnotations();
            List<PDAnnotation> destinationAnnotations = destinationPage.getAnnotations();

            for (PDAnnotation annotation : sourceAnnotations) {
                if (annotation instanceof PDAnnotationWidget widgetAnnotation) {
                    if (widgetAnnotation.getRectangle() == null) {
                        continue;
                    }
                    PDField sourceField = findFieldForWidget(sourceAcroForm, widgetAnnotation);
                    if (sourceField instanceof PDTextField) {
                        createSimpleTextField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDTextField) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDCheckBox) {
                        createSimpleCheckBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDCheckBox) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDRadioButton) {
                        createSimpleRadioButtonField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDRadioButton) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDComboBox) {
                        createSimpleComboBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDComboBox) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDListBox) {
                        createSimpleListBoxField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDListBox) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDSignatureField) {
                        createSimpleSignatureField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDSignatureField) sourceField,
                                widgetAnnotation,
                                offsetX,
                                offsetY,
                                scale,
                                pageIndex,
                                fieldNameCounters);
                    } else if (sourceField instanceof PDPushButton) {
                        createSimplePushButtonField(
                                newAcroForm,
                                destinationPage,
                                destinationAnnotations,
                                (PDPushButton) sourceField,
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
            log.warn("Failed to copy basic form fields for page {}: {}", pageIndex, e.getMessage(), e);
        }
    }

    private void createSimpleTextField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "textField";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newTextField.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();

            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));

            newWidget.setPage(destinationPage);

            newTextField.getWidgets().add(newWidget);
            newWidget.setParent(newTextField);

            newAcroForm.getFields().add(newTextField);
            destinationAnnotations.add(newWidget);

            if (sourceField.getValueAsString() != null) {
                newTextField.setValue(sourceField.getValueAsString());
            }

        } catch (Exception e) {
            log.warn("Failed to create text field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimpleCheckBoxField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "checkBox";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newCheckBox.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();

            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));

            newWidget.setPage(destinationPage);

            newCheckBox.getWidgets().add(newWidget);
            newWidget.setParent(newCheckBox);

            newAcroForm.getFields().add(newCheckBox);
            destinationAnnotations.add(newWidget);

            if (sourceField.isChecked()) {
                newCheckBox.check();
            } else {
                newCheckBox.unCheck();
            }

        } catch (Exception e) {
            log.warn("Failed to create checkbox field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimpleRadioButtonField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "radioButton";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newRadioButton.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();
            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
            newWidget.setPage(destinationPage);

            newRadioButton.getWidgets().add(newWidget);
            newWidget.setParent(newRadioButton);
            newAcroForm.getFields().add(newRadioButton);
            destinationAnnotations.add(newWidget);

            if (sourceField.getExportValues() != null) {
                newRadioButton.setExportValues(sourceField.getExportValues());
            }
            if (sourceField.getValue() != null) {
                newRadioButton.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn("Failed to create radio button field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimpleComboBoxField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "comboBox";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newComboBox.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();
            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
            newWidget.setPage(destinationPage);

            newComboBox.getWidgets().add(newWidget);
            newWidget.setParent(newComboBox);
            newAcroForm.getFields().add(newComboBox);
            destinationAnnotations.add(newWidget);

            if (sourceField.getOptions() != null) {
                newComboBox.setOptions(sourceField.getOptions());
            }
            if (sourceField.getValue() != null && !sourceField.getValue().isEmpty()) {
                newComboBox.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn("Failed to create combo box field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimpleListBoxField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "listBox";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newListBox.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();
            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
            newWidget.setPage(destinationPage);

            newListBox.getWidgets().add(newWidget);
            newWidget.setParent(newListBox);
            newAcroForm.getFields().add(newListBox);
            destinationAnnotations.add(newWidget);

            if (sourceField.getOptions() != null) {
                newListBox.setOptions(sourceField.getOptions());
            }
            if (sourceField.getValue() != null && !sourceField.getValue().isEmpty()) {
                newListBox.setValue(sourceField.getValue());
            }
        } catch (Exception e) {
            log.warn("Failed to create list box field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimpleSignatureField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "signature";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newSignatureField.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();
            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
            newWidget.setPage(destinationPage);

            newSignatureField.getWidgets().add(newWidget);
            newWidget.setParent(newSignatureField);
            newAcroForm.getFields().add(newSignatureField);
            destinationAnnotations.add(newWidget);
        } catch (Exception e) {
            log.warn("Failed to create signature field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private void createSimplePushButtonField(
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

            String originalName = sourceField.getPartialName();
            if (originalName == null) originalName = "pushButton";
            String newFieldName =
                    generateUniqueFieldName(originalName, pageIndex, fieldNameCounters);
            newPushButton.setPartialName(newFieldName);

            PDAnnotationWidget newWidget = new PDAnnotationWidget();
            PDRectangle sourceRect = sourceWidget.getRectangle();
            if (sourceRect == null) {
                return;
            }
            float newX = (sourceRect.getLowerLeftX() * scale) + offsetX;
            float newY = (sourceRect.getLowerLeftY() * scale) + offsetY;
            float newWidth = sourceRect.getWidth() * scale;
            float newHeight = sourceRect.getHeight() * scale;
            newWidget.setRectangle(new PDRectangle(newX, newY, newWidth, newHeight));
            newWidget.setPage(destinationPage);

            newPushButton.getWidgets().add(newWidget);
            newWidget.setParent(newPushButton);
            newAcroForm.getFields().add(newPushButton);
            destinationAnnotations.add(newWidget);
        } catch (Exception e) {
            log.warn("Failed to create push button field '{}': {}", sourceField.getPartialName(), e.getMessage(), e);
        }
    }

    private PDField findFieldForWidget(PDAcroForm acroForm, PDAnnotationWidget widget) {
        if (acroForm == null) {
            return null;
        }

        try {
            for (PDField field : acroForm.getFieldTree()) {
                List<PDAnnotationWidget> widgets = field.getWidgets();
                if (widgets != null && widgets.contains(widget)) {
                    return field;
                }
            }
        } catch (Exception e) {
            log.warn("Failed to find field for widget: {}", e.getMessage(), e);
        }

        return null;
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

    private void cleanupSourceFormFields(PDAcroForm sourceAcroForm) {
        if (sourceAcroForm == null) {
            return;
        }

        try {
            for (PDField field : sourceAcroForm.getFieldTree()) {
                cleanupFieldWidgets(field);
            }
        } catch (Exception e) {
            log.warn("Failed to cleanup source form fields: {}", e.getMessage(), e);
        }
    }

    private void cleanupFieldWidgets(PDField field) {
        if (field == null) {
            return;
        }

        try {
            List<PDAnnotationWidget> widgets = field.getWidgets();
            if (widgets != null && !widgets.isEmpty()) {
                List<PDAnnotationWidget> widgetsToRemove = new ArrayList<>();

                for (PDAnnotationWidget widget : widgets) {
                    if (widget.getRectangle() == null) {
                        widgetsToRemove.add(widget);
                    }
                }

                for (PDAnnotationWidget widget : widgetsToRemove) {
                    widgets.remove(widget);
                    if (widget.getPage() != null) {
                        try {
                            widget.getPage().getAnnotations().remove(widget);
                        } catch (Exception e) {
                            log.warn("Failed to remove widget annotation from page: {}", e.getMessage(), e);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to cleanup field widgets for field '{}': {}", field.getPartialName(), e.getMessage(), e);
        }
    }
}
