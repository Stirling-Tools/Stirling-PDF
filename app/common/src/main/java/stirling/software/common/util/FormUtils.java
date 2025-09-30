package stirling.software.common.util;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceEntry;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.form.*;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class FormUtils {

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
        outer:
        for (FormFieldInfo info : extracted) {
            if (info == null || info.name() == null || info.name().isBlank()) {
                continue;
            }
            String type = info.type();
            Object value;
            switch (type) {
                case "checkbox":
                    value = isChecked(info.value()) ? Boolean.TRUE : Boolean.FALSE;
                    break;
                case "listbox":
                    if (info.multiSelect()) {
                        value = new ArrayList<>();
                    } else {
                        value = safeDefault(info.value());
                    }
                    break;
                case "combobox":
                case "radio":
                case "text":
                    value = safeDefault(info.value());
                    break;
                case "button":
                case "signature":
                    continue outer; // skip non-fillable
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
        if (document == null || values == null || values.isEmpty()) return;

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            if (strict) {
                throw new IOException("No AcroForm present in document");
            }
            log.debug("Skipping form fill because document has no AcroForm");
            return;
        }

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

    public void applyFieldValues(PDDocument document, Map<String, ?> values, boolean flatten)
            throws IOException {
        applyFieldValues(document, values, flatten, false);
    }

    private void ensureAppearances(PDAcroForm acroForm) {
        if (acroForm == null) return;

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

    private PDAcroForm getAcroFormSafely(PDDocument document) {
        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            return catalog != null ? catalog.getAcroForm() : null;
        } catch (Exception e) {
            log.warn("Unable to access AcroForm: {}", e.getMessage(), e);
            return null;
        }
    }

    String filterSingleChoiceSelection(
            String selection, List<String> allowedOptions, String fieldName) {
        if (selection == null || selection.trim().isEmpty()) return null;
        List<String> filtered =
                filterChoiceSelections(List.of(selection), allowedOptions, fieldName);
        return filtered.isEmpty() ? null : filtered.get(0);
    }

    private void applyValueToField(PDField field, String value) {
        try {
            if (field instanceof PDTextField textField) {
                setTextValue(textField, value);
            } else if (field instanceof PDCheckBox checkBox) {
                LinkedHashSet<String> candidateStates = collectCheckBoxStates(checkBox);
                if (shouldCheckBoxBeChecked(value, candidateStates)) {
                    String onValue = determineCheckBoxOnValue(candidateStates, value);
                    if (onValue != null && !onValue.isBlank()) {
                        try {
                            checkBox.getCOSObject().setName(COSName.AS, onValue);
                            checkBox.getCOSObject().setName(COSName.V, onValue);
                        } catch (Exception e) {
                            log.debug(
                                    "Failed to set checkbox appearance state directly: {}",
                                    e.getMessage());
                        }
                        try {
                            checkBox.setValue(onValue);
                        } catch (IllegalArgumentException illegal) {
                            log.debug(
                                    "Standard setValue failed for checkbox '{}': {}",
                                    field.getFullyQualifiedName(),
                                    illegal.getMessage());
                            forceCheckBoxValue(checkBox, onValue);
                        }
                        if (!checkBox.isChecked()) {
                            try {
                                checkBox.check();
                            } catch (Exception checkProblem) {
                                log.debug(
                                        "Unable to confirm checkbox '{}' state: {}",
                                        field.getFullyQualifiedName(),
                                        checkProblem.getMessage());
                            }
                        }
                    } else {
                        try {
                            checkBox.check();
                        } catch (Exception checkProblem) {
                            log.debug(
                                    "Unable to infer on-state for checkbox '{}': {}",
                                    field.getFullyQualifiedName(),
                                    checkProblem.getMessage());
                        }
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
            if (selected == null) {
                choiceField.setValue("");
            } else {
                choiceField.setValue(selected);
            }
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
            return new ArrayList<>(sanitizedSelections);
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
                    if (state != null && isSettableCheckBoxState(state)) {
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

    private String determineCheckBoxOnValue(
            LinkedHashSet<String> candidateStates, String requestedValue) {
        if (requestedValue != null) {
            String normalized = requestedValue.trim();
            for (String candidate : candidateStates) {
                if (candidate.equalsIgnoreCase(normalized)) {
                    return candidate;
                }
            }
        }
        if (!candidateStates.isEmpty()) {
            return candidateStates.iterator().next();
        }
        return null;
    }

    private boolean isMeaningfulLabel(String candidate) {
        if (candidate == null || candidate.isBlank()) return false;
        return !looksGeneric(candidate.trim());
    }

    private void forceCheckBoxValue(PDCheckBox checkBox, String onValue) {
        if (!isSettableCheckBoxState(onValue)) {
            return;
        }
        try {
            checkBox.getCOSObject().setName(COSName.AS, onValue);
            checkBox.getCOSObject().setName(COSName.V, onValue);
        } catch (Exception e) {
            log.debug(
                    "Failed to force checkbox value via COS update for '{}': {}",
                    checkBox.getFullyQualifiedName(),
                    e.getMessage());
        }
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

    private boolean looksGeneric(String value) {
        String simplified =
                RegexPatternUtils.getInstance()
                        .getPunctuationPattern()
                        .matcher(value)
                        .replaceAll(" ")
                        .trim();

        if (simplified.isEmpty()) return true;

        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        return patterns.getGenericFieldNamePattern().matcher(simplified).matches()
                || patterns.getSimpleFormFieldPattern().matcher(simplified).matches()
                || patterns.getOptionalTNumericPattern().matcher(simplified).matches();
    }

    private String capitalizeWord(String word) {
        if (word == null || word.isEmpty() || word.equals(word.toUpperCase(Locale.ROOT)))
            return word;
        if (word.length() == 1) return word.toUpperCase(Locale.ROOT);
        return word.substring(0, 1).toUpperCase(Locale.ROOT)
                + word.substring(1).toLowerCase(Locale.ROOT);
    }

    private String humanizeName(String name) {
        if (name == null) {
            return null;
        }
        RegexPatternUtils patterns = RegexPatternUtils.getInstance();

        String cleaned = patterns.getFormFieldBracketPattern().matcher(name).replaceAll(" ");
        cleaned = cleaned.replace('.', ' ');
        cleaned = patterns.getUnderscoreHyphenPattern().matcher(cleaned).replaceAll(" ");
        cleaned = patterns.getCamelCaseBoundaryPattern().matcher(cleaned).replaceAll(" ");
        cleaned = patterns.getWhitespacePattern().matcher(cleaned).replaceAll(" ").trim();
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

            // Free up the original name so it can be reused.
            if (desiredName != null) {
                existingNames.remove(originalField.getFullyQualifiedName());
                existingNames.remove(originalField.getPartialName());
                desiredName = generateUniqueFieldName(desiredName, existingNames);
                existingNames.add(desiredName);
            }

            removeFieldFromDocument(document, acroForm, originalField);

            NewFormFieldDefinition replacementDefinition =
                    new NewFormFieldDefinition(
                            desiredName,
                            modification.label(),
                            resolvedType,
                            determineWidgetPageIndex(document, widget),
                            originalRectangle.getLowerLeftX(),
                            page.getMediaBox().getHeight() - originalRectangle.getUpperRightY(),
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
                if (handler == null || !handler.supportsDefinitionCreation()) {
                    handler = FormFieldTypeSupport.TEXT;
                }
                createNewField(
                        handler,
                        acroForm,
                        page,
                        originalRectangle,
                        desiredName,
                        replacementDefinition,
                        sanitizedOptions,
                        widget);
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
            List<String> options,
            PDAnnotationWidget existingWidget)
            throws IOException {

        if (!handler.supportsDefinitionCreation()) {
            throw new IllegalArgumentException(
                    "Field type '" + handler.typeName() + "' cannot be created via definition");
        }

        PDTerminalField field = handler.createField(acroForm);
        registerNewField(field, acroForm, page, rectangle, name, definition, existingWidget);
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
            return "signature";
        }
        if (field instanceof PDPushButton) {
            return "button";
        }
        if (field instanceof PDTextField) {
            return "text";
        }
        if (field instanceof PDCheckBox) {
            return "checkbox";
        }
        if (field instanceof PDComboBox) {
            return "combobox";
        }
        if (field instanceof PDListBox) {
            return "listbox";
        }
        if (field instanceof PDRadioButton) {
            return "radio";
        }
        return "text";
    }

    private String normalizeFieldType(String type) {
        if (type == null) {
            return "text";
        }
        String normalized = type.trim().toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return "text";
        }
        return normalized;
    }

    private String generateUniqueFieldName(String baseName, Set<String> existingNames) {
        String sanitized =
                Optional.ofNullable(baseName)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .orElse("field");

        String candidate = sanitized;
        int counter = 1;
        while (existingNames.contains(candidate)) {
            candidate = sanitized + "_" + counter;
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
        widget.setRectangle(rectangle);
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
