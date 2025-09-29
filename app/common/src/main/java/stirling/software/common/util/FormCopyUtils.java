package stirling.software.common.util;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

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

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class FormCopyUtils {

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
        } catch (Exception t) {
            log.warn("Failed to refresh field appearances via AcroForm: {}", t.getMessage(), t);
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

                    FieldTypeSupport handler = FieldTypeSupport.forField(terminalField);
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
            FieldTypeSupport handler,
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

    private void copyChoiceCharacteristics(PDChoice sourceField, PDChoice targetField) {
        if (sourceField == null || targetField == null) {
            return;
        }

        try {
            int flags = sourceField.getCOSObject().getInt(COSName.FF);
            targetField.getCOSObject().setInt(COSName.FF, flags);
        } catch (Exception e) {
            log.debug(
                    "Failed to copy choice field flags for '{}': {}",
                    sourceField.getFullyQualifiedName(),
                    e.getMessage());
        }

        if (sourceField instanceof PDListBox sourceList
                && targetField instanceof PDListBox targetList) {
            try {
                targetList.setMultiSelect(sourceList.isMultiSelect());
            } catch (Exception e) {
                log.debug(
                        "Failed to sync list box multi-select flag for '{}': {}",
                        sourceField.getFullyQualifiedName(),
                        e.getMessage());
            }
        }
    }

    public enum FieldTypeSupport {
        TEXT("text", "textField", PDTextField.class) {
            @Override
            PDTerminalField createField(PDAcroForm acroForm) {
                PDTextField textField = new PDTextField(acroForm);
                textField.setDefaultAppearance("/Helv 12 Tf 0 g");
                return textField;
            }

            @Override
            void copyFromOriginal(PDTerminalField source, PDTerminalField target)
                    throws IOException {
                PDTextField src = (PDTextField) source;
                PDTextField dst = (PDTextField) target;
                String value = src.getValueAsString();
                if (value != null) {
                    dst.setValue(value);
                }
            }

            @Override
            boolean supportsDefinitionCreation() {
                return true;
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
            void copyFromOriginal(PDTerminalField source, PDTerminalField target)
                    throws IOException {
                PDCheckBox src = (PDCheckBox) source;
                PDCheckBox dst = (PDCheckBox) target;
                if (src.isChecked()) {
                    dst.check();
                } else {
                    dst.unCheck();
                }
            }

            @Override
            boolean supportsDefinitionCreation() {
                return true;
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
                if (FormUtils.isChecked(definition.defaultValue())) {
                    checkBox.check();
                } else {
                    checkBox.unCheck();
                }
            }
        },
        RADIO("radio", "radioButton", PDRadioButton.class) {
            @Override
            PDTerminalField createField(PDAcroForm acroForm) {
                return new PDRadioButton(acroForm);
            }

            @Override
            void copyFromOriginal(PDTerminalField source, PDTerminalField target)
                    throws IOException {
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
            void copyFromOriginal(PDTerminalField source, PDTerminalField target)
                    throws IOException {
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
            boolean supportsDefinitionCreation() {
                return true;
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
            void copyFromOriginal(PDTerminalField source, PDTerminalField target)
                    throws IOException {
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
            boolean supportsDefinitionCreation() {
                return true;
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
                        List<String> selections =
                                FormUtils.parseMultiChoiceSelections(defaultValue);
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

        private static final Map<String, FieldTypeSupport> BY_TYPE =
                Arrays.stream(values())
                        .collect(
                                Collectors.toUnmodifiableMap(
                                        FieldTypeSupport::typeName, Function.identity()));

        private final String typeName;
        private final String fallbackWidgetName;
        private final Class<? extends PDTerminalField> fieldClass;

        FieldTypeSupport(
                String typeName,
                String fallbackWidgetName,
                Class<? extends PDTerminalField> fieldClass) {
            this.typeName = typeName;
            this.fallbackWidgetName = fallbackWidgetName;
            this.fieldClass = fieldClass;
        }

        static FieldTypeSupport forField(PDField field) {
            if (field == null) {
                return null;
            }
            for (FieldTypeSupport handler : values()) {
                if (handler.fieldClass.isInstance(field)) {
                    return handler;
                }
            }
            return null;
        }

        static FieldTypeSupport forTypeName(String typeName) {
            if (typeName == null) {
                return null;
            }
            return BY_TYPE.get(typeName);
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

        boolean supportsDefinitionCreation() {
            return false;
        }

        void applyNewFieldDefinition(
                PDTerminalField field,
                FormUtils.NewFormFieldDefinition definition,
                List<String> options)
                throws IOException {
            // default no-op
        }
    }
}
