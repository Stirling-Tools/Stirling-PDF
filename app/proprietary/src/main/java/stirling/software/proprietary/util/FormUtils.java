package stirling.software.proprietary.util;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.form.*;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.RegexPatternUtils;

@Slf4j
@UtilityClass
public class FormUtils {

    // Field type constants
    public final String FIELD_TYPE_TEXT = "text";
    public final String FIELD_TYPE_CHECKBOX = "checkbox";
    public final String FIELD_TYPE_COMBOBOX = "combobox";
    public final String FIELD_TYPE_LISTBOX = "listbox";
    public final String FIELD_TYPE_RADIO = "radio";
    public final String FIELD_TYPE_BUTTON = "button";
    public final String FIELD_TYPE_SIGNATURE = "signature";

    // Set of choice field types that support options
    public final Set<String> CHOICE_FIELD_TYPES =
            Set.of(FIELD_TYPE_COMBOBOX, FIELD_TYPE_LISTBOX, FIELD_TYPE_RADIO);

    /**
     * Returns a normalized logical type string for the supplied PDFBox field instance. Centralized
     * so all callers share identical mapping logic.
     *
     * @param field PDField to classify
     * @return one of: signature, button, text, checkbox, combobox, listbox, radio (defaults to
     *     text)
     */
    public String detectFieldType(PDField field) {
        if (field instanceof PDSignatureField) {
            return FIELD_TYPE_SIGNATURE;
        }
        if (field instanceof PDPushButton) {
            return FIELD_TYPE_BUTTON;
        }
        if (field instanceof PDTextField) {
            return FIELD_TYPE_TEXT;
        }
        if (field instanceof PDCheckBox) {
            return FIELD_TYPE_CHECKBOX;
        }
        if (field instanceof PDComboBox) {
            return FIELD_TYPE_COMBOBOX;
        }
        if (field instanceof PDListBox) {
            return FIELD_TYPE_LISTBOX;
        }
        if (field instanceof PDRadioButton) {
            return FIELD_TYPE_RADIO;
        }
        return FIELD_TYPE_TEXT;
    }

    public List<FormFieldInfo> extractFormFields(PDDocument document) {
        if (document == null) return List.of();

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) return List.of();

        List<FormFieldInfo> fields = new ArrayList<>();
        Map<String, Integer> typeCounters = new HashMap<>();
        Map<Integer, Integer> pageOrderCounters = new HashMap<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (!(field instanceof PDTerminalField terminalField)) {
                continue;
            }

            String type = detectFieldType(terminalField);

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
            boolean multiSelect = resolveMultiSelect(terminalField);
            int pageOrder = pageOrderCounters.merge(pageIndex, 1, Integer::sum) - 1;

            fields.add(
                    new FormFieldInfo(
                            name,
                            displayLabel,
                            type,
                            currentValue,
                            options.isEmpty() ? null : Collections.unmodifiableList(options),
                            required,
                            pageIndex,
                            multiSelect,
                            tooltip,
                            pageOrder));
        }

        fields.sort(
                (a, b) -> {
                    int pageCompare = Integer.compare(a.pageIndex(), b.pageIndex());
                    if (pageCompare != 0) {
                        return pageCompare;
                    }
                    int orderCompare = Integer.compare(a.pageOrder(), b.pageOrder());
                    if (orderCompare != 0) {
                        return orderCompare;
                    }
                    return a.name().compareToIgnoreCase(b.name());
                });

        return Collections.unmodifiableList(fields);
    }

    /**
     * Build a single record object (field-name -> value placeholder) that can be directly submitted
     * to /api/v1/form/fill as the 'data' JSON. For checkboxes a boolean false is supplied unless
     * currently checked. For list/choice fields we default to empty string. For multi-select list
     * boxes we return an empty JSON array. Radio buttons get their current value (or empty string).
     * Signature and button fields are skipped.
     */
    public Map<String, Object> buildFillTemplateRecord(List<FormFieldInfo> extracted) {
        if (extracted == null || extracted.isEmpty()) return Map.of();
        Map<String, Object> record = new LinkedHashMap<>();
        for (FormFieldInfo info : extracted) {
            if (info == null || info.name() == null || info.name().isBlank()) {
                continue;
            }
            String type = info.type();
            Object value;
            switch (type) {
                case FIELD_TYPE_CHECKBOX:
                    value = isChecked(info.value()) ? Boolean.TRUE : Boolean.FALSE;
                    break;
                case FIELD_TYPE_LISTBOX:
                    if (info.multiSelect()) {
                        value = new ArrayList<>();
                    } else {
                        value = safeDefault(info.value());
                    }
                    break;
                case FIELD_TYPE_BUTTON, FIELD_TYPE_SIGNATURE:
                    continue; // skip non-fillable
                default:
                    value = safeDefault(info.value());
            }
            record.put(info.name(), value);
        }
        return record;
    }

    public FormFieldExtraction extractFieldsWithTemplate(PDDocument document) {
        List<FormFieldInfo> fields = extractFormFields(document);
        Map<String, Object> template = buildFillTemplateRecord(fields);
        return new FormFieldExtraction(fields, template);
    }

    private String safeDefault(String current) {
        return current != null ? current : "";
    }

    public void applyFieldValues(
            PDDocument document, Map<String, ?> values, boolean flatten, boolean strict)
            throws IOException {
        if (document == null) {
            return;
        }

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            if (strict) {
                throw new IOException("No AcroForm present in document");
            }
            log.debug("Skipping form fill because document has no AcroForm");
            if (flatten) {
                flattenEntireDocument(document, null);
            }
            return;
        }

        if (values != null && !values.isEmpty()) {
            acroForm.setCacheFields(true);

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
                applyValueToField(field, value, strict);
            }

            ensureAppearances(acroForm);
        }

        repairWidgetGeometry(document, acroForm);

        if (flatten) {
            flattenEntireDocument(document, acroForm);
        }
    }

    private void flattenViaRendering(PDDocument document, PDAcroForm acroForm) throws IOException {
        if (document == null) {
            return;
        }

        // Remove the AcroForm structure first since we're rendering everything
        if (acroForm != null) {
            try {
                if (document.getDocumentCatalog() != null) {
                    document.getDocumentCatalog().setAcroForm(null);
                }
            } catch (Exception e) {
                log.debug("Failed to remove AcroForm before rendering: {}", e.getMessage());
            }
        }

        PDFRenderer renderer = new PDFRenderer(document);
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);

        int requestedDpi =
                properties != null && properties.getSystem() != null
                        ? properties.getSystem().getMaxDPI()
                        : 300;

        rebuildDocumentFromImages(document, renderer, requestedDpi);
    }

    // note: this implementation suffers from:
    // https://issues.apache.org/jira/browse/PDFBOX-5962
    private void flattenEntireDocument(PDDocument document, PDAcroForm acroForm)
            throws IOException {
        if (document == null) {
            return;
        }

        flattenViaRendering(document, acroForm);
    }

    private void rebuildDocumentFromImages(PDDocument document, PDFRenderer renderer, int dpi)
            throws IOException {
        int pageCount = document.getNumberOfPages();

        for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            BufferedImage rendered;
            try {
                rendered = renderer.renderImageWithDPI(pageIndex, dpi, ImageType.RGB);
            } catch (OutOfMemoryError e) {
                throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
            } catch (NegativeArraySizeException e) {
                throw ExceptionUtils.createOutOfMemoryDpiException(pageIndex + 1, dpi, e);
            }

            PDPage page = document.getPage(pageIndex);
            PDRectangle mediaBox = page.getMediaBox();

            // Ensure the page has resources before drawing
            if (page.getResources() == null) {
                page.setResources(new PDResources());
            }

            List<PDAnnotation> annotations = new ArrayList<>(page.getAnnotations());
            for (PDAnnotation annotation : annotations) {
                annotation.getCOSObject().removeItem(COSName.AP);
                page.getAnnotations().remove(annotation);
            }

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.OVERWRITE, true, true)) {
                PDImageXObject pdImage = JPEGFactory.createFromImage(document, rendered);
                contentStream.drawImage(
                        pdImage,
                        mediaBox.getLowerLeftX(),
                        mediaBox.getLowerLeftY(),
                        mediaBox.getWidth(),
                        mediaBox.getHeight());
            }
        }
    }

    private void repairWidgetGeometry(PDDocument document, PDAcroForm acroForm) {
        if (document == null || acroForm == null) {
            return;
        }

        for (PDField field : acroForm.getFieldTree()) {
            if (!(field instanceof PDTerminalField terminalField)) {
                continue;
            }

            List<PDAnnotationWidget> widgets = terminalField.getWidgets();
            if (widgets == null || widgets.isEmpty()) {
                continue;
            }

            for (PDAnnotationWidget widget : widgets) {
                if (widget == null) {
                    continue;
                }

                PDRectangle rectangle = widget.getRectangle();
                boolean invalidRectangle =
                        rectangle == null
                                || rectangle.getWidth() <= 0
                                || rectangle.getHeight() <= 0;

                PDPage page = widget.getPage();
                if (page == null) {
                    page = resolveWidgetPage(document, widget);
                    if (page != null) {
                        widget.setPage(page);
                    }
                }

                if (invalidRectangle) {
                    if (page == null && document.getNumberOfPages() > 0) {
                        page = document.getPage(0);
                        widget.setPage(page);
                    }

                    if (page != null) {
                        PDRectangle mediaBox = page.getMediaBox();
                        float fallbackWidth = Math.min(200f, mediaBox.getWidth());
                        float fallbackHeight = Math.min(40f, mediaBox.getHeight());
                        PDRectangle fallbackRectangle =
                                new PDRectangle(
                                        mediaBox.getLowerLeftX(),
                                        mediaBox.getLowerLeftY(),
                                        fallbackWidth,
                                        fallbackHeight);
                        widget.setRectangle(fallbackRectangle);

                        try {
                            List<PDAnnotation> pageAnnotations = page.getAnnotations();
                            if (pageAnnotations != null && !pageAnnotations.contains(widget)) {
                                pageAnnotations.add(widget);
                            }
                        } catch (IOException e) {
                            log.debug(
                                    "Unable to repair annotations for widget '{}': {}",
                                    terminalField.getFullyQualifiedName(),
                                    e.getMessage());
                        }
                    }
                }
            }
        }
    }

    public void applyFieldValues(PDDocument document, Map<String, ?> values, boolean flatten)
            throws IOException {
        applyFieldValues(document, values, flatten, false);
    }

    private void ensureAppearances(PDAcroForm acroForm) {
        if (acroForm == null) return;

        acroForm.setNeedAppearances(true);
        try {
            try {
                PDResources dr = acroForm.getDefaultResources();
                if (dr == null) {
                    dr = new PDResources();
                    acroForm.setDefaultResources(dr);
                }
                PDFont helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                try {
                    // Map standard name used by many DAs
                    dr.put(COSName.getPDFName("Helvetica"), helvetica);
                } catch (Exception ignore) {
                    try {
                        dr.add(helvetica);
                    } catch (Exception ignore2) {
                        // ignore
                    }
                }
            } catch (Exception fontPrep) {
                log.debug(
                        "Unable to ensure default font resources before refresh: {}",
                        fontPrep.getMessage());
            }
            acroForm.refreshAppearances();
        } catch (IOException e) {
            log.warn("Failed to refresh form appearances: {}", e.getMessage(), e);
            return; // Don't set NeedAppearances to false if refresh failed
        }

        // After successful appearance generation, set NeedAppearances to false
        // to signal that appearance streams are now embedded authoritatively
        try {
            acroForm.setNeedAppearances(false);
        } catch (Exception ignored) {
            // Fallback to direct COS manipulation if the setter fails
            acroForm.getCOSObject().setBoolean(COSName.NEED_APPEARANCES, false);
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

    public String filterSingleChoiceSelection(
            String selection, List<String> allowedOptions, String fieldName) {
        if (selection == null || selection.trim().isEmpty()) return null;
        List<String> filtered =
                filterChoiceSelections(List.of(selection), allowedOptions, fieldName);
        return filtered.isEmpty() ? null : filtered.get(0);
    }

    private void applyValueToField(PDField field, String value, boolean strict) throws IOException {
        try {
            if (field instanceof PDTextField textField) {
                setTextValue(textField, value);
            } else if (field instanceof PDCheckBox checkBox) {
                LinkedHashSet<String> candidateStates = collectCheckBoxStates(checkBox);
                boolean shouldCheck = shouldCheckBoxBeChecked(value, candidateStates);
                try {
                    if (shouldCheck) {
                        checkBox.check();
                    } else {
                        checkBox.unCheck();
                    }
                } catch (IOException checkProblem) {
                    log.warn(
                            "Failed to set checkbox state for '{}': {}",
                            field.getFullyQualifiedName(),
                            checkProblem.getMessage(),
                            checkProblem);
                    if (strict) {
                        throw checkProblem;
                    }
                }
            } else if (field instanceof PDRadioButton radioButton) {
                if (value != null && !value.isBlank()) {
                    radioButton.setValue(value);
                }
            } else if (field instanceof PDChoice choiceField) {
                applyChoiceValue(choiceField, value);
            } else if (field instanceof PDPushButton) {
                log.debug("Ignore Push button");
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
            if (strict) {
                if (e instanceof IOException io) {
                    throw io;
                }
                throw new IOException(
                        "Failed to set value for field '" + field.getFullyQualifiedName() + "'", e);
            }
        }
    }

    void setTextValue(PDTextField textField, String value) throws IOException {
        try {
            textField.setValue(value != null ? value : "");
            return;
        } catch (IOException initial) {
            log.debug(
                    "Primary fill failed for text field '{}': {}",
                    textField.getFullyQualifiedName(),
                    initial.getMessage());
        }

        try {
            PDAcroForm acroForm = textField.getAcroForm();
            PDResources dr = acroForm != null ? acroForm.getDefaultResources() : null;
            if (dr == null && acroForm != null) {
                dr = new PDResources();
                acroForm.setDefaultResources(dr);
            }

            String resourceName = "Helv";
            try {
                PDFont helvetica = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                if (dr != null) {
                    try {
                        COSName alias = dr.add(helvetica);
                        if (alias != null
                                && alias.getName() != null
                                && !alias.getName().isBlank()) {
                            resourceName = alias.getName();
                        }
                    } catch (Exception addEx) {
                        try {
                            COSName explicit = COSName.getPDFName("Helvetica");
                            dr.put(explicit, helvetica);
                            resourceName = explicit.getName();
                        } catch (Exception ignore) {
                            // ignore
                        }
                    }
                }
            } catch (Exception fontEx) {
                log.debug(
                        "Unable to prepare Helvetica font for '{}': {}",
                        textField.getFullyQualifiedName(),
                        fontEx.getMessage());
            }

            textField.setDefaultAppearance("/" + resourceName + " 12 Tf 0 g");
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

        List<String> allowedOptions = collectChoiceAllowedValues(choiceField);

        if (choiceField.isMultiSelect()) {
            List<String> selections = parseMultiChoiceSelections(value);
            List<String> filteredSelections =
                    filterChoiceSelections(
                            selections, allowedOptions, choiceField.getFullyQualifiedName());
            if (filteredSelections.isEmpty()) {
                choiceField.setValue(Collections.emptyList());
            } else {
                choiceField.setValue(filteredSelections);
            }
        } else {
            String selected =
                    filterSingleChoiceSelection(
                            value, allowedOptions, choiceField.getFullyQualifiedName());
            choiceField.setValue(Objects.requireNonNullElse(selected, ""));
        }
    }

    List<String> filterChoiceSelections(
            List<String> selections, List<String> allowedOptions, String fieldName) {
        if (selections == null || selections.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> sanitizedSelections =
                selections.stream()
                        .filter(Objects::nonNull)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList();

        if (sanitizedSelections.isEmpty()) {
            return Collections.emptyList();
        }

        if (allowedOptions == null || allowedOptions.isEmpty()) {
            throw new IllegalArgumentException(
                    "The /Opt array is missing for choice field '"
                            + fieldName
                            + "', cannot set values.");
        }

        Map<String, String> allowedLookup = new LinkedHashMap<>();
        for (String option : allowedOptions) {
            if (option == null) {
                continue;
            }
            String normalized = option.trim();
            if (!normalized.isEmpty()) {
                allowedLookup.putIfAbsent(normalized.toLowerCase(Locale.ROOT), option);
            }
        }

        List<String> validSelections = new ArrayList<>();
        for (String selection : sanitizedSelections) {
            String normalized = selection.toLowerCase(Locale.ROOT);
            String resolved = allowedLookup.get(normalized);
            if (resolved != null) {
                validSelections.add(resolved);
            } else {
                log.debug(
                        "Ignoring unsupported option '{}' for choice field '{}'",
                        selection,
                        fieldName);
            }
        }
        return validSelections;
    }

    List<String> parseMultiChoiceSelections(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
    }

    List<String> collectChoiceAllowedValues(PDChoice choiceField) {
        if (choiceField == null) {
            return Collections.emptyList();
        }

        LinkedHashSet<String> allowed = new LinkedHashSet<>();

        try {
            List<String> exports = choiceField.getOptionsExportValues();
            if (exports != null) {
                exports.stream()
                        .filter(Objects::nonNull)
                        .forEach(
                                option -> {
                                    String cleaned = option.trim();
                                    if (!cleaned.isEmpty()) {
                                        allowed.add(option);
                                    }
                                });
            }
        } catch (Exception e) {
            log.debug(
                    "Unable to read export values for choice field '{}': {}",
                    choiceField.getFullyQualifiedName(),
                    e.getMessage());
        }

        try {
            List<String> display = choiceField.getOptionsDisplayValues();
            if (display != null) {
                display.stream()
                        .filter(Objects::nonNull)
                        .forEach(
                                option -> {
                                    String cleaned = option.trim();
                                    if (!cleaned.isEmpty()) {
                                        allowed.add(option);
                                    }
                                });
            }
        } catch (Exception e) {
            log.debug(
                    "Unable to read display values for choice field '{}': {}",
                    choiceField.getFullyQualifiedName(),
                    e.getMessage());
        }

        if (allowed.isEmpty()) {
            return Collections.emptyList();
        }

        return new ArrayList<>(allowed);
    }

    boolean isChecked(String value) {
        if (value == null) return false;
        String normalized = value.trim().toLowerCase();
        return "true".equals(normalized)
                || "1".equals(normalized)
                || "yes".equals(normalized)
                || "on".equals(normalized)
                || "checked".equals(normalized);
    }

    private LinkedHashSet<String> collectCheckBoxStates(PDCheckBox checkBox) {
        LinkedHashSet<String> states = new LinkedHashSet<>();
        try {
            String onValue = checkBox.getOnValue();
            if (isSettableCheckBoxState(onValue)) {
                states.add(onValue.trim());
            }
        } catch (Exception e) {
            log.debug(
                    "Failed to obtain explicit on-value for checkbox '{}': {}",
                    checkBox.getFullyQualifiedName(),
                    e.getMessage());
        }

        try {
            for (PDAnnotationWidget widget : checkBox.getWidgets()) {
                PDAppearanceDictionary appearance = widget.getAppearance();
                if (appearance == null) {
                    continue;
                }
                PDAppearanceEntry normal = appearance.getNormalAppearance();
                if (normal == null) {
                    continue;
                }
                if (normal.isSubDictionary()) {
                    Map<COSName, PDAppearanceStream> entries = normal.getSubDictionary();
                    if (entries != null) {
                        for (COSName name : entries.keySet()) {
                            String state = name.getName();
                            if (isSettableCheckBoxState(state)) {
                                states.add(state.trim());
                            }
                        }
                    }
                } else if (normal.isStream()) {
                    COSName appearanceState = widget.getAppearanceState();
                    String state = appearanceState != null ? appearanceState.getName() : null;
                    if (isSettableCheckBoxState(state)) {
                        states.add(state.trim());
                    }
                }
            }
        } catch (Exception e) {
            log.debug(
                    "Failed to obtain appearance states for checkbox '{}': {}",
                    checkBox.getFullyQualifiedName(),
                    e.getMessage());
        }

        try {
            List<String> exports = checkBox.getExportValues();
            if (exports != null) {
                for (String export : exports) {
                    if (isSettableCheckBoxState(export)) {
                        states.add(export.trim());
                    }
                }
            }
        } catch (Exception e) {
            log.debug(
                    "Failed to obtain export values for checkbox '{}': {}",
                    checkBox.getFullyQualifiedName(),
                    e.getMessage());
        }
        return states;
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

    List<String> resolveOptions(PDTerminalField field) {
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

    private boolean resolveMultiSelect(PDTerminalField field) {
        if (field instanceof PDListBox listBox) {
            try {
                return listBox.isMultiSelect();
            } catch (Exception e) {
                log.debug(
                        "Failed to resolve multi-select flag for list box '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
        }
        return false;
    }

    private boolean isSettableCheckBoxState(String state) {
        if (state == null) return false;
        String trimmed = state.trim();
        return !trimmed.isEmpty() && !"Off".equalsIgnoreCase(trimmed);
    }

    private boolean shouldCheckBoxBeChecked(String value, LinkedHashSet<String> candidateStates) {
        if (value == null) {
            return false;
        }
        if (isChecked(value)) {
            return true;
        }
        String normalized = value.trim();
        if (normalized.isEmpty() || "off".equalsIgnoreCase(normalized)) {
            return false;
        }
        for (String state : candidateStates) {
            if (state.equalsIgnoreCase(normalized)) {
                return true;
            }
        }
        return false;
    }

    private String deriveDisplayLabel(
            PDField field,
            String name,
            String tooltip,
            String type,
            int typeIndex,
            List<String> options) {
        String alternate = cleanLabel(field.getAlternateFieldName());
        if (alternate != null && !looksGeneric(alternate)) {
            return alternate;
        }

        String tooltipLabel = cleanLabel(tooltip);
        if (tooltipLabel != null && !looksGeneric(tooltipLabel)) {
            return tooltipLabel;
        }

        // Only check options for choice-type fields (combobox, listbox, radio)
        if (CHOICE_FIELD_TYPES.contains(type) && options != null && !options.isEmpty()) {
            String optionCandidate = cleanLabel(options.get(0));
            if (optionCandidate != null && !looksGeneric(optionCandidate)) {
                return optionCandidate;
            }
        }

        String humanized = cleanLabel(humanizeName(name));
        if (humanized != null && !looksGeneric(humanized)) {
            return humanized;
        }

        return fallbackLabelForType(type, typeIndex);
    }

    private String cleanLabel(String label) {
        if (label == null) return null;

        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        String cleaned = label.trim();

        cleaned = patterns.getPattern("[.:]+$").matcher(cleaned).replaceAll("").trim();

        return cleaned.isEmpty() ? null : cleaned;
    }

    private boolean looksGeneric(String value) {
        if (value == null) return true;

        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        String simplified = patterns.getPunctuationPattern().matcher(value).replaceAll(" ").trim();

        if (simplified.isEmpty()) return true;

        return patterns.getGenericFieldNamePattern().matcher(simplified).matches()
                || patterns.getSimpleFormFieldPattern().matcher(simplified).matches()
                || patterns.getOptionalTNumericPattern().matcher(simplified).matches();
    }

    private String humanizeName(String name) {
        if (name == null) return null;

        RegexPatternUtils patterns = RegexPatternUtils.getInstance();

        String cleaned = patterns.getFormFieldBracketPattern().matcher(name).replaceAll(" ");
        cleaned = cleaned.replace('.', ' ');
        cleaned = patterns.getUnderscoreHyphenPattern().matcher(cleaned).replaceAll(" ");
        cleaned = patterns.getCamelCaseBoundaryPattern().matcher(cleaned).replaceAll(" ");
        cleaned = patterns.getWhitespacePattern().matcher(cleaned).replaceAll(" ").trim();

        return cleaned.isEmpty() ? null : cleaned;
    }

    public void modifyFormFields(
            PDDocument document, List<ModifyFormFieldDefinition> modifications) {
        if (document == null || modifications == null || modifications.isEmpty()) return;

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            log.warn("Cannot modify fields because the document has no AcroForm");
            return;
        }

        Set<String> existingNames = collectExistingFieldNames(acroForm);

        for (ModifyFormFieldDefinition modification : modifications) {
            if (modification == null || modification.targetName() == null) {
                continue;
            }

            String lookupName = modification.targetName().trim();
            if (lookupName.isEmpty()) {
                continue;
            }

            PDField originalField = locateField(acroForm, lookupName);
            if (originalField == null) {
                log.warn("No matching field '{}' found for modification", lookupName);
                continue;
            }

            List<PDAnnotationWidget> widgets = originalField.getWidgets();
            if (widgets == null || widgets.isEmpty()) {
                log.warn("Field '{}' has no widgets; skipping modification", lookupName);
                continue;
            }

            PDAnnotationWidget widget = widgets.get(0);
            PDRectangle originalRectangle = cloneRectangle(widget.getRectangle());
            PDPage page = resolveWidgetPage(document, widget);
            if (page == null || originalRectangle == null) {
                log.warn(
                        "Unable to resolve widget page or rectangle for '{}'; skipping",
                        lookupName);
                continue;
            }

            String resolvedType =
                    Optional.ofNullable(modification.type())
                            .map(FormUtils::normalizeFieldType)
                            .orElseGet(() -> detectFieldType(originalField));

            if (!RegexPatternUtils.getInstance()
                    .getSupportedNewFieldTypes()
                    .contains(resolvedType)) {
                log.warn("Unsupported target type '{}' for field '{}'", resolvedType, lookupName);
                continue;
            }

            String desiredName =
                    Optional.ofNullable(modification.name())
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .orElseGet(originalField::getPartialName);

            if (desiredName != null) {
                existingNames.remove(originalField.getFullyQualifiedName());
                existingNames.remove(originalField.getPartialName());
                desiredName = generateUniqueFieldName(desiredName, existingNames);
                existingNames.add(desiredName);
            }

            // Try to modify field in-place first for simple property changes
            String currentType = detectFieldType(originalField);
            boolean typeChanging = !currentType.equals(resolvedType);

            if (!typeChanging) {
                try {
                    modifyFieldPropertiesInPlace(originalField, modification, desiredName);
                    log.debug("Successfully modified field '{}' in-place", lookupName);
                    continue; // Skip the remove-and-recreate process
                } catch (Exception e) {
                    log.debug(
                            "In-place modification failed for '{}', falling back to recreation: {}",
                            lookupName,
                            e.getMessage());
                }
            }

            // For type changes or when in-place modification fails, use remove-and-recreate
            // But create the new field first to ensure success before removing the original
            NewFormFieldDefinition replacementDefinition =
                    new NewFormFieldDefinition(
                            desiredName,
                            modification.label(),
                            resolvedType,
                            determineWidgetPageIndex(document, widget),
                            originalRectangle.getLowerLeftX(),
                            originalRectangle.getLowerLeftY(),
                            originalRectangle.getWidth(),
                            originalRectangle.getHeight(),
                            modification.required(),
                            modification.multiSelect(),
                            modification.options(),
                            modification.defaultValue(),
                            modification.tooltip());

            List<String> sanitizedOptions = sanitizeOptions(modification.options());

            try {
                FormFieldTypeSupport handler = FormFieldTypeSupport.forTypeName(resolvedType);
                if (handler == null || handler.doesNotsupportsDefinitionCreation()) {
                    handler = FormFieldTypeSupport.TEXT;
                }

                // Create new field first - if this fails, original field is preserved
                createNewField(
                        handler,
                        acroForm,
                        page,
                        originalRectangle,
                        desiredName,
                        replacementDefinition,
                        sanitizedOptions); // Don't reuse widget for type changes

                removeFieldFromDocument(document, acroForm, originalField);

                log.debug(
                        "Successfully replaced field '{}' with type '{}'",
                        lookupName,
                        resolvedType);
            } catch (Exception e) {
                log.warn(
                        "Failed to modify form field '{}' to type '{}': {}",
                        lookupName,
                        resolvedType,
                        e.getMessage(),
                        e);
            }
        }

        ensureAppearances(acroForm);
    }

    private void modifyFieldPropertiesInPlace(
            PDField field, ModifyFormFieldDefinition modification, String newName)
            throws IOException {
        if (newName != null && !newName.equals(field.getPartialName())) {
            field.setPartialName(newName);
        }

        if (modification.label() != null) {
            if (!modification.label().isBlank()) {
                field.setAlternateFieldName(modification.label());
            } else {
                field.setAlternateFieldName(null);
            }
        }

        if (modification.required() != null) {
            field.setRequired(modification.required());
        }

        if (modification.defaultValue() != null) {
            if (!modification.defaultValue().isBlank()) {
                field.setValue(modification.defaultValue());
            } else {
                field.setValue(null);
            }
        }

        if (field instanceof PDChoice choiceField
                && (modification.options() != null || modification.multiSelect() != null)) {

            if (modification.options() != null) {
                List<String> sanitizedOptions = sanitizeOptions(modification.options());
                choiceField.setOptions(sanitizedOptions);
            }

            if (modification.multiSelect() != null) {
                choiceField.setMultiSelect(modification.multiSelect());
            }
        }

        // Update tooltip on widgets
        if (modification.tooltip() != null) {
            List<PDAnnotationWidget> widgets = field.getWidgets();
            for (PDAnnotationWidget widget : widgets) {
                if (!modification.tooltip().isBlank()) {
                    widget.getCOSObject().setString(COSName.TU, modification.tooltip());
                } else {
                    widget.getCOSObject().removeItem(COSName.TU);
                }
            }
        }
    }

    private String fallbackLabelForType(String type, int typeIndex) {
        String suffix = " " + typeIndex;
        return switch (type) {
            case FIELD_TYPE_CHECKBOX -> "Checkbox" + suffix;
            case FIELD_TYPE_RADIO -> "Option" + suffix;
            case FIELD_TYPE_COMBOBOX -> "Dropdown" + suffix;
            case FIELD_TYPE_LISTBOX -> "List" + suffix;
            case FIELD_TYPE_TEXT -> "Text field" + suffix;
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
        Map<PDAnnotationWidget, Integer> widgetPageFallbacks = null;
        for (PDAnnotationWidget widget : widgets) {
            int idx = resolveWidgetPageIndex(document, widget);
            if (idx >= 0) {
                return idx;
            }
            try {
                COSDictionary widgetDictionary = widget.getCOSObject();
                if (widgetDictionary != null
                        && widgetDictionary.getDictionaryObject(COSName.P) == null) {
                    if (widgetPageFallbacks == null) {
                        widgetPageFallbacks = buildWidgetPageFallbackMap(document);
                    }
                    Integer fallbackIndex = widgetPageFallbacks.get(widget);
                    if (fallbackIndex != null && fallbackIndex >= 0) {
                        return fallbackIndex;
                    }
                }
            } catch (Exception e) {
                log.debug(
                        "Failed to inspect widget page reference for field '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
        }
        return -1;
    }

    private int resolveWidgetPageIndex(PDDocument document, PDAnnotationWidget widget) {
        if (document == null || widget == null) {
            return -1;
        }
        try {
            COSDictionary widgetDictionary = widget.getCOSObject();
            if (widgetDictionary != null
                    && widgetDictionary.getDictionaryObject(COSName.P) == null) {
                Map<PDAnnotationWidget, Integer> fallback = buildWidgetPageFallbackMap(document);
                Integer index = fallback.get(widget);
                if (index != null) {
                    return index;
                }
            }
        } catch (Exception e) {
            log.debug("Widget page lookup via fallback map failed: {}", e.getMessage());
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

    public void deleteFormFields(PDDocument document, List<String> fieldNames) {
        if (document == null || fieldNames == null || fieldNames.isEmpty()) return;

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            log.warn("Cannot delete fields because the document has no AcroForm");
            return;
        }

        for (String name : fieldNames) {
            if (name == null || name.isBlank()) {
                continue;
            }

            PDField field = locateField(acroForm, name.trim());
            if (field == null) {
                log.warn("No matching field '{}' found for deletion", name);
                continue;
            }

            removeFieldFromDocument(document, acroForm, field);
        }

        ensureAppearances(acroForm);
    }

    private void removeFieldFromDocument(PDDocument document, PDAcroForm acroForm, PDField field) {
        if (field == null) return;

        try {
            List<PDAnnotationWidget> widgets = field.getWidgets();
            if (widgets != null) {
                for (PDAnnotationWidget widget : widgets) {
                    PDPage page = resolveWidgetPage(document, widget);
                    if (page != null) {
                        page.getAnnotations().remove(widget);
                    }
                }
                widgets.clear();
            }

            PDNonTerminalField parent = field.getParent();
            if (parent != null) {
                List<PDField> children = parent.getChildren();
                if (children != null) {
                    children.removeIf(existing -> existing == field);
                }

                try {
                    COSArray kids = parent.getCOSObject().getCOSArray(COSName.KIDS);
                    if (kids != null) {
                        kids.removeObject(field.getCOSObject());
                    }
                } catch (Exception e) {
                    log.debug(
                            "Failed to remove field '{}' from parent kids array: {}",
                            field.getFullyQualifiedName(),
                            e.getMessage());
                }
            }

            if (acroForm != null) {
                pruneFieldReferences(acroForm.getFields(), field);

                try {
                    COSArray fieldsArray = acroForm.getCOSObject().getCOSArray(COSName.FIELDS);
                    if (fieldsArray != null) {
                        fieldsArray.removeObject(field.getCOSObject());
                    }
                } catch (Exception e) {
                    log.debug(
                            "Failed to remove field '{}' from AcroForm COS array: {}",
                            field.getFullyQualifiedName(),
                            e.getMessage());
                }
            }

            try {
                field.getCOSObject().clear();
            } catch (Exception e) {
                log.debug(
                        "Failed to clear COS dictionary for field '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
        } catch (Exception e) {
            log.warn(
                    "Failed to detach field '{}' from document: {}",
                    field.getFullyQualifiedName(),
                    e.getMessage());
        }
    }

    private void pruneFieldReferences(List<PDField> fields, PDField target) {
        if (fields == null || fields.isEmpty() || target == null) return;

        fields.removeIf(existing -> isSameFieldReference(existing, target));

        for (PDField existing : List.copyOf(fields)) {
            if (existing instanceof PDNonTerminalField nonTerminal) {
                List<PDField> children = nonTerminal.getChildren();
                if (children != null && !children.isEmpty()) {
                    pruneFieldReferences(children, target);
                }
            }
        }
    }

    private boolean isSameFieldReference(PDField a, PDField b) {
        if (a == b) return true;
        if (a == null || b == null) return false;

        String aName = a.getFullyQualifiedName();
        String bName = b.getFullyQualifiedName();
        if (aName != null && aName.equals(bName)) return true;

        String aPartial = a.getPartialName();
        String bPartial = b.getPartialName();
        return aPartial != null && aPartial.equals(bPartial);
    }

    private void createNewField(
            FormFieldTypeSupport handler,
            PDAcroForm acroForm,
            PDPage page,
            PDRectangle rectangle,
            String name,
            NewFormFieldDefinition definition,
            List<String> options)
            throws IOException {

        if (handler.doesNotsupportsDefinitionCreation()) {
            throw new IllegalArgumentException(
                    "Field type '" + handler.typeName() + "' cannot be created via definition");
        }

        PDTerminalField field = handler.createField(acroForm);
        registerNewField(field, acroForm, page, rectangle, name, definition, null);
        List<String> preparedOptions = options != null ? options : List.of();
        handler.applyNewFieldDefinition(field, definition, preparedOptions);
    }

    private PDRectangle cloneRectangle(PDRectangle rectangle) {
        if (rectangle == null) {
            return null;
        }
        return new PDRectangle(
                rectangle.getLowerLeftX(),
                rectangle.getLowerLeftY(),
                rectangle.getWidth(),
                rectangle.getHeight());
    }

    private PDPage resolveWidgetPage(PDDocument document, PDAnnotationWidget widget) {
        if (widget == null) {
            return null;
        }
        PDPage page = widget.getPage();
        if (page != null) {
            return page;
        }
        int pageIndex = determineWidgetPageIndex(document, widget);
        if (pageIndex >= 0) {
            try {
                return document.getPage(pageIndex);
            } catch (Exception e) {
                log.debug("Failed to resolve widget page index {}: {}", pageIndex, e.getMessage());
            }
        }
        return null;
    }

    private int determineWidgetPageIndex(PDDocument document, PDAnnotationWidget widget) {
        if (document == null || widget == null) {
            return -1;
        }

        PDPage directPage = widget.getPage();
        if (directPage != null) {
            int index = 0;
            for (PDPage page : document.getPages()) {
                if (page == directPage) {
                    return index;
                }
                index++;
            }
        }

        int pageCount = document.getNumberOfPages();
        for (int i = 0; i < pageCount; i++) {
            try {
                PDPage page = document.getPage(i);
                for (PDAnnotation annotation : page.getAnnotations()) {
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

    private Map<PDAnnotationWidget, Integer> buildWidgetPageFallbackMap(PDDocument document) {
        if (document == null) {
            return Collections.emptyMap();
        }

        Map<PDAnnotationWidget, Integer> widgetToPage = new IdentityHashMap<>();
        int pageCount = document.getNumberOfPages();
        for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
            PDPage page;
            try {
                page = document.getPage(pageIndex);
            } catch (Exception e) {
                log.debug(
                        "Failed to access page {} while building widget map: {}",
                        pageIndex,
                        e.getMessage());
                continue;
            }

            List<PDAnnotation> annotations;
            try {
                annotations = page.getAnnotations();
            } catch (IOException e) {
                log.debug(
                        "Failed to access annotations for page {}: {}", pageIndex, e.getMessage());
                continue;
            }

            if (annotations == null || annotations.isEmpty()) {
                continue;
            }

            for (PDAnnotation annotation : annotations) {
                if (!(annotation instanceof PDAnnotationWidget widget)) {
                    continue;
                }

                COSDictionary widgetDictionary;
                try {
                    widgetDictionary = widget.getCOSObject();
                } catch (Exception e) {
                    log.debug(
                            "Failed to access widget dictionary while building fallback map: {}",
                            e.getMessage());
                    continue;
                }

                if (widgetDictionary == null
                        || widgetDictionary.getDictionaryObject(COSName.P) != null) {
                    continue;
                }

                widgetToPage.putIfAbsent(widget, pageIndex);
            }
        }

        return widgetToPage.isEmpty() ? Collections.emptyMap() : widgetToPage;
    }

    private Set<String> collectExistingFieldNames(PDAcroForm acroForm) {
        if (acroForm == null) {
            return Collections.emptySet();
        }
        Set<String> existing = new HashSet<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (field instanceof PDTerminalField) {
                String fqn = field.getFullyQualifiedName();
                if (fqn != null && !fqn.isEmpty()) {
                    existing.add(fqn);
                }
            }
        }
        return existing;
    }

    private PDField locateField(PDAcroForm acroForm, String name) {
        if (acroForm == null || name == null) {
            return null;
        }
        PDField direct = acroForm.getField(name);
        if (direct != null) {
            return direct;
        }
        for (PDField field : acroForm.getFieldTree()) {
            if (field == null) {
                continue;
            }
            String fq = field.getFullyQualifiedName();
            if (name.equals(fq)) {
                return field;
            }
            String partial = field.getPartialName();
            if (name.equals(partial)) {
                return field;
            }
        }
        return null;
    }

    private String normalizeFieldType(String type) {
        if (type == null) {
            return FIELD_TYPE_TEXT;
        }
        String normalized = type.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return FIELD_TYPE_TEXT;
        }
        return normalized;
    }

    private String generateUniqueFieldName(String baseName, Set<String> existingNames) {
        String sanitized =
                Optional.ofNullable(baseName)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .orElse("field");

        StringBuilder candidateBuilder = new StringBuilder(sanitized);
        String candidate = candidateBuilder.toString();
        int counter = 1;

        while (existingNames.contains(candidate)) {
            candidateBuilder.setLength(0);
            candidateBuilder.append(sanitized).append("_").append(counter);
            candidate = candidateBuilder.toString();
            counter++;
        }

        return candidate;
    }

    private List<String> sanitizeOptions(List<String> options) {
        if (options == null || options.isEmpty()) {
            return List.of();
        }
        return options.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private <T extends PDTerminalField> void registerNewField(
            T field,
            PDAcroForm acroForm,
            PDPage page,
            PDRectangle rectangle,
            String name,
            NewFormFieldDefinition definition,
            PDAnnotationWidget existingWidget)
            throws IOException {

        field.setPartialName(name);
        if (definition.label() != null && !definition.label().isBlank()) {
            try {
                field.setAlternateFieldName(definition.label());
            } catch (Exception e) {
                log.debug("Unable to set alternate field name for '{}': {}", name, e.getMessage());
            }
        }
        field.setRequired(Boolean.TRUE.equals(definition.required()));

        PDAnnotationWidget widget =
                existingWidget != null ? existingWidget : new PDAnnotationWidget();

        // Ensure rectangle is valid and set before any appearance-related operations
        // please note removal of this might cause **subtle** issues
        PDRectangle validRectangle = rectangle;
        if (validRectangle == null
                || validRectangle.getWidth() <= 0
                || validRectangle.getHeight() <= 0) {
            log.warn("Invalid rectangle for field '{}', using default dimensions", name);
            validRectangle = new PDRectangle(100, 100, 100, 20);
        }
        widget.setRectangle(validRectangle);
        widget.setPage(page);

        if (existingWidget == null) {
            widget.setPrinted(true);
        }

        if (definition.tooltip() != null && !definition.tooltip().isBlank()) {
            widget.getCOSObject().setString(COSName.TU, definition.tooltip());
        } else {
            try {
                widget.getCOSObject().removeItem(COSName.TU);
            } catch (Exception e) {
                log.debug("Unable to clear tooltip for '{}': {}", name, e.getMessage());
            }
        }

        field.getWidgets().add(widget);
        widget.setParent(field);

        List<PDAnnotation> annotations = page.getAnnotations();
        if (annotations == null) {
            page.getAnnotations().add(widget);
        } else if (!annotations.contains(widget)) {
            annotations.add(widget);
        }
        acroForm.getFields().add(field);
    }

    // Delegation methods to GeneralFormCopyUtils for form field transformation
    public boolean hasAnyRotatedPage(PDDocument document) {
        return stirling.software.common.util.GeneralFormCopyUtils.hasAnyRotatedPage(document);
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
        stirling.software.common.util.GeneralFormCopyUtils.copyAndTransformFormFields(
                sourceDocument,
                newDocument,
                totalPages,
                pagesPerSheet,
                cols,
                rows,
                cellWidth,
                cellHeight);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FormFieldExtraction(List<FormFieldInfo> fields, Map<String, Object> template) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NewFormFieldDefinition(
            String name,
            String label,
            String type,
            Integer pageIndex,
            Float x,
            Float y,
            Float width,
            Float height,
            Boolean required,
            Boolean multiSelect,
            List<String> options,
            String defaultValue,
            String tooltip) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ModifyFormFieldDefinition(
            String targetName,
            String name,
            String label,
            String type,
            Boolean required,
            Boolean multiSelect,
            List<String> options,
            String defaultValue,
            String tooltip) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FormFieldInfo(
            String name,
            String label,
            String type,
            String value,
            List<String> options,
            boolean required,
            int pageIndex,
            boolean multiSelect,
            String tooltip,
            int pageOrder) {}
}
