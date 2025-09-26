package stirling.software.common.util;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

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

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class FormUtils {

    private final Pattern GENERIC_NAME_PATTERN =
            Pattern.compile(
                    "(?i)^(field|form|text|textbox|checkbox|check|radio|combo|list|untitled|input|question|subform|page|control)[\\s_\\-]*[0-9]*$");
    private final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");
    private final Pattern OPTIONAL_T_NUMERIC_PATTERN = Pattern.compile("(?i)^t?\\d{1,3}$");
    private final Pattern FORM_FIELD_PATTERN =
            Pattern.compile("(?i)^(text|field|form)[\\s_-]*\\d+$");
    private final Pattern PUNCTUATION_PATTERN = Pattern.compile("[\\p{Punct}]+");

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
        } catch (Throwable t) {
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

            copyChoiceCharacteristics(sourceField, newComboBox);

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

            copyChoiceCharacteristics(sourceField, newListBox);

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

            if (!initialized) {
                return;
            }

        } catch (Exception e) {
            log.warn(
                    "Failed to create push button field '{}': {}",
                    sourceField.getPartialName(),
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

    public List<FormFieldInfo> extractFormFields(PDDocument document) {
        if (document == null) {
            return List.of();
        }

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            return List.of();
        }

        List<FormFieldInfo> fields = new ArrayList<>();
        Map<String, Integer> typeCounters = new HashMap<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (!(field instanceof PDTerminalField terminalField)) {
                continue;
            }

            String type = resolveFieldType(terminalField);

            String name =
                    Optional.ofNullable(field.getFullyQualifiedName())
                            .orElseGet(field::getPartialName);
            if (name == null || name.isBlank()) {
                continue;
            }

            String currentValue = safeValue(terminalField);
            boolean required = field.isRequired();
            int pageIndex = resolveFirstWidgetPageIndex(document, terminalField);
            List<String> options = resolveOptions(terminalField);
            String tooltip = resolveTooltip(terminalField);
            int typeIndex = typeCounters.merge(type, 1, Integer::sum);
            String displayLabel =
                    deriveDisplayLabel(field, name, tooltip, type, typeIndex, options);

            fields.add(
                    new FormFieldInfo(
                            name,
                            displayLabel,
                            type,
                            currentValue,
                            options.isEmpty() ? null : Collections.unmodifiableList(options),
                            required,
                            pageIndex,
                            tooltip));
        }

        fields.sort(
                (a, b) -> {
                    int pageCompare = Integer.compare(a.pageIndex(), b.pageIndex());
                    if (pageCompare != 0) {
                        return pageCompare;
                    }
                    return a.name().compareToIgnoreCase(b.name());
                });

        return Collections.unmodifiableList(fields);
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

    public void applyFieldValues(PDDocument document, Map<String, ?> values, boolean flatten)
            throws IOException {
        applyFieldValues(document, values, flatten, false);
    }

    public void applyFieldValues(
            PDDocument document, Map<String, ?> values, boolean flatten, boolean strict)
            throws IOException {
        if (document == null || values == null || values.isEmpty()) {
            return;
        }

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            if (strict) {
                throw new IOException("No AcroForm present in document");
            }
            log.debug("Skipping form fill because document has no AcroForm");
            return;
        }

        ensureFontResources(acroForm);

        Map<String, PDField> lookup = new LinkedHashMap<>();
        for (PDField field : acroForm.getFieldTree()) {
            String fqName = field.getFullyQualifiedName();
            if (fqName != null) {
                lookup.putIfAbsent(fqName, field);
            }
            String partial = field.getPartialName();
            if (partial != null) {
                lookup.putIfAbsent(partial, field);
            }
        }

        for (Map.Entry<String, ?> entry : values.entrySet()) {
            String key = entry.getKey();
            if (key == null || key.isBlank()) {
                continue;
            }

            PDField field = lookup.get(key);
            if (field == null) {
                field = acroForm.getField(key);
            }
            if (field == null) {
                log.debug("No matching field found for '{}', skipping", key);
                continue;
            }

            Object rawValue = entry.getValue();
            String value = rawValue == null ? null : Objects.toString(rawValue, null);
            applyValueToField(field, value);
        }

        ensureAppearances(acroForm);

        if (flatten) {
            try {
                acroForm.flatten();
            } catch (Exception e) {
                log.warn("Failed to flatten AcroForm: {}", e.getMessage(), e);
            }
        }
    }

    private PDAcroForm getAcroFormSafely(PDDocument document) {
        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            return catalog != null ? catalog.getAcroForm() : null;
        } catch (Exception e) {
            log.warn("Unable to access AcroForm: {}", e.getMessage(), e);
            return null;
        }
    }

    private void ensureAppearances(PDAcroForm acroForm) {
        if (acroForm == null) {
            return;
        }

        boolean originalNeedAppearances = acroForm.getNeedAppearances();
        acroForm.setNeedAppearances(true);
        try {
            Method refresh = acroForm.getClass().getMethod("refreshAppearances");
            refresh.invoke(acroForm);
        } catch (NoSuchMethodException e) {
            log.debug("AcroForm.refreshAppearances() not available on this PDFBox version");
        } catch (Exception e) {
            log.warn("Failed to refresh form appearances: {}", e.getMessage(), e);
        } finally {
            if (!originalNeedAppearances) {
                try {
                    acroForm.setNeedAppearances(false);
                } catch (Exception ignored) {
                    acroForm.getCOSObject().setBoolean(COSName.NEED_APPEARANCES, false);
                }
            }
        }
    }

    private void ensureFontResources(PDAcroForm acroForm) {
        try {
            PDResources resources = acroForm.getDefaultResources();
            if (resources == null) {
                resources = new PDResources();
                acroForm.setDefaultResources(resources);
            }

            registerFontIfMissing(resources, "Helvetica", Standard14Fonts.FontName.HELVETICA);
            registerFontIfMissing(resources, "Helv", Standard14Fonts.FontName.HELVETICA);
            registerFontIfMissing(resources, "ZaDb", Standard14Fonts.FontName.ZAPF_DINGBATS);

            String appearance = acroForm.getDefaultAppearance();
            if (appearance == null || appearance.isBlank()) {
                acroForm.setDefaultAppearance("/Helvetica 12 Tf 0 g");
            }
        } catch (Exception e) {
            log.debug("Unable to ensure font resources for form: {}", e.getMessage());
        }
    }

    private void registerFontIfMissing(
            PDResources resources, String alias, Standard14Fonts.FontName fontName)
            throws IOException {
        COSName name = COSName.getPDFName(alias);
        if (resources.getFont(name) == null) {
            resources.put(name, new PDType1Font(fontName));
        }
    }

    private void applyValueToField(PDField field, String value) {
        try {
            if (field instanceof PDTextField textField) {
                setTextValue(textField, value);
            } else if (field instanceof PDCheckBox checkBox) {
                if (isChecked(value)) {
                    String onValue = determineCheckBoxOnValue(checkBox);
                    if (onValue != null) {
                        try {
                            checkBox.getCOSObject().setName(COSName.AS, onValue);
                            checkBox.getCOSObject().setName(COSName.V, onValue);
                        } catch (Exception e) {
                            log.debug(
                                    "Failed to set checkbox appearance state directly: {}",
                                    e.getMessage());
                        }
                        checkBox.setValue(onValue);
                        if (!checkBox.isChecked()) {
                            checkBox.check();
                        }
                    } else {
                        checkBox.check();
                    }
                } else {
                    checkBox.unCheck();
                }
            } else if (field instanceof PDRadioButton radioButton) {
                if (value != null && !value.isBlank()) {
                    radioButton.setValue(value);
                }
            } else if (field instanceof PDChoice choiceField) {
                applyChoiceValue(choiceField, value);
            } else if (field instanceof PDPushButton) {
                log.debug("Ignore Push button");
                // Ignore buttons during fill operations
            } else if (field instanceof PDSignatureField) {
                log.debug("Skipping signature field '{}'", field.getFullyQualifiedName());
            } else {
                field.setValue(value != null ? value : "");
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to set value for field '{}': {}",
                    field.getFullyQualifiedName(),
                    e.getMessage(),
                    e);
        }
    }

    private void setTextValue(PDTextField textField, String value) throws IOException {
        try {
            textField.setValue(value != null ? value : "");
            return;
        } catch (IOException initial) {
            log.debug(
                    "Primary fill failed for text field '{}': {}",
                    textField.getFullyQualifiedName(),
                    initial.getMessage());
        }

        PDAcroForm acroForm = textField.getAcroForm();
        ensureFontResources(acroForm);
        try {
            textField.setDefaultAppearance("/Helvetica 12 Tf 0 g");
        } catch (Exception e) {
            log.debug(
                    "Unable to adjust default appearance for '{}': {}",
                    textField.getFullyQualifiedName(),
                    e.getMessage());
        }

        textField.setValue(value != null ? value : "");
    }

    private void applyChoiceValue(PDChoice choiceField, String value) throws IOException {
        if (value == null) {
            choiceField.setValue("");
            return;
        }

        if (choiceField.isMultiSelect()) {
            List<String> selections =
                    Arrays.stream(value.split(","))
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .toList();
            if (selections.isEmpty()) {
                choiceField.setValue(Collections.emptyList());
            } else {
                choiceField.setValue(selections);
            }
        } else {
            choiceField.setValue(value);
        }
    }

    private boolean isChecked(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.trim().toLowerCase();
        return "true".equals(normalized)
                || "1".equals(normalized)
                || "yes".equals(normalized)
                || "on".equals(normalized)
                || "checked".equals(normalized);
    }

    private String resolveFieldType(PDTerminalField field) {
        if (field instanceof PDTextField) {
            return "text";
        }
        if (field instanceof PDCheckBox) {
            return "checkbox";
        }
        if (field instanceof PDRadioButton) {
            return "radio";
        }
        if (field instanceof PDComboBox) {
            return "combobox";
        }
        if (field instanceof PDListBox) {
            return "listbox";
        }
        if (field instanceof PDSignatureField) {
            return "signature";
        }
        if (field instanceof PDPushButton) {
            return "button";
        }
        return "field";
    }

    private String safeValue(PDTerminalField field) {
        try {
            return field.getValueAsString();
        } catch (Exception e) {
            log.debug(
                    "Failed to read current value for field '{}': {}",
                    field.getFullyQualifiedName(),
                    e.getMessage());
            return null;
        }
    }

    private List<String> resolveOptions(PDTerminalField field) {
        try {
            if (field instanceof PDChoice choice) {
                List<String> display = choice.getOptionsDisplayValues();
                if (display != null && !display.isEmpty()) {
                    return new ArrayList<>(display);
                }
                List<String> exportValues = choice.getOptionsExportValues();
                if (exportValues != null && !exportValues.isEmpty()) {
                    return new ArrayList<>(exportValues);
                }
            } else if (field instanceof PDRadioButton radio) {
                List<String> exports = radio.getExportValues();
                if (exports != null && !exports.isEmpty()) {
                    return new ArrayList<>(exports);
                }
            } else if (field instanceof PDCheckBox checkBox) {
                List<String> exports = checkBox.getExportValues();
                if (exports != null && !exports.isEmpty()) {
                    return new ArrayList<>(exports);
                }
            }
        } catch (Exception e) {
            log.debug(
                    "Failed to resolve options for field '{}': {}",
                    field.getFullyQualifiedName(),
                    e.getMessage());
        }
        return Collections.emptyList();
    }

    private String determineCheckBoxOnValue(PDCheckBox checkBox) {
        try {
            String onValue = checkBox.getOnValue();
            if (onValue != null && !onValue.isBlank()) {
                return onValue;
            }
        } catch (Exception e) {
            log.debug("Failed to obtain explicit on-value for checkbox: {}", e.getMessage());
        }

        try {
            List<String> exports = checkBox.getExportValues();
            if (exports != null && !exports.isEmpty()) {
                return exports.get(0);
            }
        } catch (Exception e) {
            log.debug("Failed to obtain export values for checkbox: {}", e.getMessage());
        }
        return "Yes";
    }

    private String deriveDisplayLabel(
            PDField field,
            String name,
            String tooltip,
            String type,
            int typeIndex,
            List<String> options) {
        String alternate = cleanLabel(field.getAlternateFieldName());
        if (isMeaningfulLabel(alternate)) {
            return alternate;
        }

        String tooltipLabel = cleanLabel(tooltip);
        if (isMeaningfulLabel(tooltipLabel)) {
            return tooltipLabel;
        }

        if (options != null && !options.isEmpty()) {
            String optionCandidate = cleanLabel(options.get(0));
            if (isMeaningfulLabel(optionCandidate)) {
                return optionCandidate;
            }
        }

        String humanized = cleanLabel(humanizeName(name));
        if (isMeaningfulLabel(humanized)) {
            return humanized;
        }

        return fallbackLabelForType(type, typeIndex);
    }

    private String cleanLabel(String label) {
        if (label == null) {
            return null;
        }
        String cleaned = label.trim();
        while (true) {
            final boolean b = !cleaned.isEmpty() && cleaned.charAt(cleaned.length() - 1) == '.';
            if (!b) break;
            cleaned = cleaned.substring(0, cleaned.length() - 1).trim();
        }
        if (!cleaned.isEmpty() && cleaned.charAt(cleaned.length() - 1) == ':') {
            cleaned = cleaned.substring(0, cleaned.length() - 1).trim();
        }
        return cleaned.isEmpty() ? null : cleaned;
    }

    private boolean isMeaningfulLabel(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return false;
        }
        String normalized = candidate.trim();
        return !looksGeneric(normalized);
    }

    private boolean looksGeneric(String value) {
        String simplified = PUNCTUATION_PATTERN.matcher(value).replaceAll(" ").trim();
        if (simplified.isEmpty()) {
            return true;
        }
        if (GENERIC_NAME_PATTERN.matcher(simplified).matches()) {
            return true;
        }
        if (FORM_FIELD_PATTERN.matcher(simplified).matches()) {
            return true;
        }
        return OPTIONAL_T_NUMERIC_PATTERN.matcher(simplified).matches();
    }

    private String humanizeName(String name) {
        if (name == null) {
            return null;
        }
        String cleaned =
                WHITESPACE_PATTERN
                        .matcher(
                                name.replaceAll("[#\\[\\]]", " ")
                                        .replace('.', ' ')
                                        .replaceAll("[_-]+", " ")
                                        .replaceAll("(?<=[a-z])(?=[A-Z])", " "))
                        .replaceAll(" ")
                        .trim();
        if (cleaned.isEmpty()) {
            return null;
        }

        StringBuilder builder = new StringBuilder();
        for (String part : cleaned.split(" ")) {
            if (part.isBlank()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(capitalizeWord(part));
        }
        String result = builder.toString().trim();
        return result.isEmpty() ? null : result;
    }

    private String capitalizeWord(String word) {
        if (word == null || word.isEmpty()) {
            return word;
        }
        if (word.equals(word.toUpperCase(Locale.ROOT))) {
            return word;
        }
        if (word.length() == 1) {
            return word.toUpperCase(Locale.ROOT);
        }
        return word.substring(0, 1).toUpperCase(Locale.ROOT)
                + word.substring(1).toLowerCase(Locale.ROOT);
    }

    private String fallbackLabelForType(String type, int typeIndex) {
        String suffix = " " + typeIndex;
        return switch (type) {
            case "checkbox" -> "Checkbox" + suffix;
            case "radio" -> "Option" + suffix;
            case "combobox" -> "Dropdown" + suffix;
            case "listbox" -> "List" + suffix;
            case "text" -> "Text field" + suffix;
            default -> "Field" + suffix;
        };
    }

    private String resolveTooltip(PDTerminalField field) {
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null) {
            return null;
        }
        for (PDAnnotationWidget widget : widgets) {
            if (widget == null) {
                continue;
            }
            try {
                String alt = widget.getAnnotationName();
                if (alt != null && !alt.isBlank()) {
                    return alt;
                }
                String tooltip = widget.getCOSObject().getString(COSName.TU);
                if (tooltip != null && !tooltip.isBlank()) {
                    return tooltip;
                }
            } catch (Exception e) {
                log.debug(
                        "Failed to read tooltip for field '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
        }
        return null;
    }

    private int resolveFirstWidgetPageIndex(PDDocument document, PDTerminalField field) {
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null || widgets.isEmpty()) {
            return -1;
        }
        for (PDAnnotationWidget widget : widgets) {
            int idx = resolveWidgetPageIndex(document, widget);
            if (idx >= 0) {
                return idx;
            }
        }
        return -1;
    }

    private int resolveWidgetPageIndex(PDDocument document, PDAnnotationWidget widget) {
        if (document == null || widget == null) {
            return -1;
        }
        try {
            PDPage page = widget.getPage();
            if (page != null) {
                int idx = document.getPages().indexOf(page);
                if (idx >= 0) {
                    return idx;
                }
            }
        } catch (Exception e) {
            log.debug("Widget page lookup failed: {}", e.getMessage());
        }

        int pageCount = document.getNumberOfPages();
        for (int i = 0; i < pageCount; i++) {
            try {
                PDPage candidate = document.getPage(i);
                List<PDAnnotation> annotations = candidate.getAnnotations();
                for (PDAnnotation annotation : annotations) {
                    if (annotation == widget) {
                        return i;
                    }
                }
            } catch (IOException e) {
                log.debug("Failed to inspect annotations for page {}: {}", i, e.getMessage());
            }
        }
        return -1;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FormFieldInfo(
            String name,
            String label,
            String type,
            String value,
            List<String> options,
            boolean required,
            int pageIndex,
            String tooltip) {}
}
