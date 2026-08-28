package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
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
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceCharacteristicsDictionary;
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
import stirling.software.common.model.FormFieldWithCoordinates;

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

    /** The reserved off-state name every toggle widget must carry an appearance for. */
    private final String OFF_STATE = "Off";

    /** The on-state a checkbox gets when the definition supplies no export values. */
    private final String DEFAULT_CHECKBOX_ON_STATE = "Yes";

    /**
     * Threshold in PDF points for considering two widgets to be on the same line. Fields whose
     * y-coordinates differ by less than this value are sorted left-to-right by x-coordinate instead
     * of top-to-bottom.
     */
    private static final float SAME_LINE_THRESHOLD_PT = 10.0f;

    /** Below this, a rect change is a no-op and the existing /AP still maps exactly. */
    private static final float GEOMETRY_EPSILON_PT = 0.01f;

    private static final Pattern HEX_UUID_PATTERN =
            Pattern.compile("^[0-9a-fA-F]{8}[0-9a-fA-F]{24,}$");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("\\s+");

    /**
     * Returns a normalized logical type string for the supplied PDFBox field instance. Centralized
     * so all callers share identical mapping logic.
     *
     * @param field PDField to classify
     * @return one of: signature, button, text, checkbox, combobox, listbox, radio (defaults to
     *     text)
     */
    public String detectFieldType(PDField field) {
        return switch (field) {
            case PDSignatureField ignored -> FIELD_TYPE_SIGNATURE;
            case PDPushButton ignored -> FIELD_TYPE_BUTTON;
            case PDTextField ignored -> FIELD_TYPE_TEXT;
            case PDCheckBox ignored -> FIELD_TYPE_CHECKBOX;
            case PDComboBox ignored -> FIELD_TYPE_COMBOBOX;
            case PDListBox ignored -> FIELD_TYPE_LISTBOX;
            case PDRadioButton ignored -> FIELD_TYPE_RADIO;
            case null, default -> FIELD_TYPE_TEXT;
        };
    }

    public List<FormFieldInfo> extractFormFields(PDDocument document) {
        if (document == null) return List.of();

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) return List.of();

        List<FormFieldInfo> fields = new ArrayList<>();
        Map<String, Integer> typeCounters = new HashMap<>();
        Map<Integer, Integer> pageOrderCounters = new HashMap<>();
        Map<COSDictionary, Integer> annotationPageMap = buildAnnotationPageMap(document);

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

            String currentValue = safeFieldValue(terminalField);
            boolean required = field.isRequired();
            int pageIndex = resolveFirstWidgetPageIndex(document, terminalField, annotationPageMap);
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
     * Extract form fields with widget coordinates for the interactive form viewer.
     *
     * @param document PDF document
     * @return List of form fields with coordinates and metadata
     */
    public List<FormFieldWithCoordinates> extractFormFieldsWithCoordinates(PDDocument document) {
        if (document == null) return List.of();

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) return List.of();

        List<FormFieldWithCoordinates> fields = new ArrayList<>();
        Map<String, Integer> typeCounters = new HashMap<>();

        Map<COSDictionary, Integer> annotationPageMap = buildAnnotationPageMap(document);

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

            String currentValue = safeFieldValue(terminalField);
            boolean required = field.isRequired();
            boolean readOnly = field.isReadOnly();
            List<String> options = resolveOptions(terminalField);
            List<String> displayOptions = resolveDisplayOptions(terminalField);
            String tooltip = resolveTooltip(terminalField);
            int typeIndex = typeCounters.merge(type, 1, Integer::sum);
            String displayLabel =
                    deriveDisplayLabel(field, name, tooltip, type, typeIndex, options);
            boolean multiSelect = resolveMultiSelect(terminalField);
            boolean multiline =
                    terminalField instanceof PDTextField
                            && ((PDTextField) terminalField).isMultiline();

            // Extract widget coordinates
            List<FormFieldWithCoordinates.WidgetCoordinates> widgets =
                    extractWidgetCoordinates(document, terminalField, annotationPageMap);

            // Only include displayOptions when they differ from export options
            List<String> displayOptsToSend = null;
            if (displayOptions != null
                    && !displayOptions.isEmpty()
                    && !displayOptions.equals(options)) {
                displayOptsToSend = displayOptions;
            }

            fields.add(
                    FormFieldWithCoordinates.builder()
                            .name(name)
                            .label(displayLabel)
                            .type(type)
                            .value(currentValue)
                            .options(options.isEmpty() ? null : options)
                            .displayOptions(displayOptsToSend)
                            .required(required)
                            .readOnly(readOnly)
                            .multiSelect(multiSelect)
                            .multiline(multiline)
                            .tooltip(tooltip)
                            .widgets(widgets.isEmpty() ? null : widgets)
                            .maxLength(extractMaxLength(terminalField))
                            .buttonActionSpec(extractButtonAction(terminalField))
                            .build());
        }

        // Sort by page and position
        fields.sort(new FieldCoordinateComparator());

        log.debug("Total fields processed: {}", fields.size());
        log.debug(
                "Fields WITH widgets: {}",
                fields.stream()
                        .filter(f -> f.getWidgets() != null && !f.getWidgets().isEmpty())
                        .count());
        log.debug(
                "Fields WITHOUT widgets: {}",
                fields.stream()
                        .filter(f -> f.getWidgets() == null || f.getWidgets().isEmpty())
                        .count());

        fields.stream()
                .filter(f -> f.getWidgets() == null || f.getWidgets().isEmpty())
                .forEach(
                        f ->
                                log.debug(
                                        "Field '{}' type={} has NO widget coordinates",
                                        f.getName(),
                                        f.getType()));

        return Collections.unmodifiableList(fields);
    }

    /**
     * Extract widget coordinates for a form field.
     *
     * @param document PDF document
     * @param field Terminal field
     * @return List of widget coordinates
     */
    private List<FormFieldWithCoordinates.WidgetCoordinates> extractWidgetCoordinates(
            PDDocument document,
            PDTerminalField field,
            Map<COSDictionary, Integer> annotationPageMap) {
        List<FormFieldWithCoordinates.WidgetCoordinates> result = new ArrayList<>();

        List<PDAnnotationWidget> widgets = field.getWidgets();

        log.debug(
                "Field '{}' type={} has {} widgets",
                field.getFullyQualifiedName(),
                field.getClass().getSimpleName(),
                widgets != null ? widgets.size() : 0);

        if (widgets == null || widgets.isEmpty()) {
            // Some fields (especially text fields) might be their own widget annotation
            log.trace(
                    "Field '{}' has no widgets, checking if field acts as its own annotation",
                    field.getFullyQualifiedName());
            try {
                COSDictionary fieldDict = field.getCOSObject();
                COSBase rectBase = fieldDict.getDictionaryObject(COSName.RECT);
                if (rectBase instanceof COSArray rectArray) {
                    int pageIndex =
                            findPageIndexForAnnotation(document, fieldDict, annotationPageMap);
                    if (pageIndex >= 0) {
                        PDRectangle rectangle = new PDRectangle(rectArray);
                        addWidget(
                                result,
                                createWidgetCoordinates(
                                        document, rectangle, pageIndex, null, field));
                    } else {
                        log.warn(
                                "Found rectangle for field '{}' but could not resolve page index",
                                field.getFullyQualifiedName());
                    }
                }
            } catch (Exception e) {
                log.debug(
                        "Could not extract direct rectangle for field '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
            return result;
        }

        // For radio buttons, pre-resolve export values per widget
        List<String> exportValues = null;
        if (field instanceof PDRadioButton radio) {
            exportValues = radio.getExportValues();
        }

        for (int i = 0; i < widgets.size(); i++) {
            PDAnnotationWidget widget = widgets.get(i);
            try {
                PDRectangle rectangle = widget.getRectangle();
                if (rectangle == null) {
                    log.warn(
                            "Field '{}' widget {} has NULL rectangle",
                            field.getFullyQualifiedName(),
                            i);
                    continue;
                }

                int pageIndex = resolveWidgetPageIndex(document, widget, annotationPageMap);
                if (pageIndex < 0) {
                    log.warn(
                            "Field '{}' widget {} could not resolve page index",
                            field.getFullyQualifiedName(),
                            i);
                    continue;
                }

                // Resolve export value for radio/checkbox widgets
                String exportValue = null;
                if (exportValues != null && i < exportValues.size()) {
                    exportValue = exportValues.get(i);
                } else if (field instanceof PDButton) {
                    // Fall back to appearance state name from the widget's normal appearance
                    try {
                        var ap = widget.getAppearance();
                        if (ap != null && ap.getNormalAppearance() != null) {
                            var normalAp = ap.getNormalAppearance();
                            if (normalAp.isSubDictionary()) {
                                for (var cosName : normalAp.getSubDictionary().keySet()) {
                                    String key = cosName.getName();
                                    if (!"Off".equals(key)) {
                                        exportValue = key;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (Exception e) {
                        log.trace(
                                "Could not extract export value for widget in '{}': {}",
                                field.getFullyQualifiedName(),
                                e.getMessage());
                    }
                }

                addWidget(
                        result,
                        createWidgetCoordinates(
                                document, rectangle, pageIndex, exportValue, field));
            } catch (Exception e) {
                log.debug(
                        "Failed to extract coordinates for widget in field '{}': {}",
                        field.getFullyQualifiedName(),
                        e.getMessage());
            }
        }

        return result;
    }

    /** Unreadable geometry yields null, which must never reach the list the comparator walks. */
    private void addWidget(
            List<FormFieldWithCoordinates.WidgetCoordinates> target,
            FormFieldWithCoordinates.WidgetCoordinates widget) {
        if (widget != null) {
            target.add(widget);
        }
    }

    private FormFieldWithCoordinates.WidgetCoordinates createWidgetCoordinates(
            PDDocument document,
            PDRectangle rectangle,
            int pageIndex,
            String exportValue,
            PDTerminalField field) {
        if (pageIndex < 0 || pageIndex >= document.getNumberOfPages()) {
            return null;
        }

        PDPage page = document.getPage(pageIndex);
        PDRectangle cropBox = page.getCropBox();

        // Use CropBox dimensions for the y-flip.
        // Note: getWidth() and getHeight() return dimensions BEFORE rotation.
        float cropHeight = cropBox.getHeight();

        // Get absolute widget coordinates (in MediaBox space, un-rotated)
        float pdfX = rectangle.getLowerLeftX();
        float pdfY = rectangle.getLowerLeftY();
        float width = rectangle.getWidth();
        float height = rectangle.getHeight();

        // Adjust relative to CropBox origin
        float relativeX = pdfX - cropBox.getLowerLeftX();
        float relativeY = pdfY - cropBox.getLowerLeftY();

        // Convert from PDF lower-left origin to CSS upper-left origin (y-flip).
        // Widget /Rect coordinates are always in un-rotated PDF user space.
        // The embedpdf viewer wraps all page content inside a <Rotate> CSS
        // component that handles visual rotation — we must NOT apply any
        // rotation transform here, or widgets would be double-rotated.
        float finalX = relativeX;
        float finalY = cropHeight - relativeY - height;
        float finalW = width;
        float finalH = height;

        // Only nonsense is rejected. A widget outside the visible page is legal and must still be
        // reported, or the field loses its geometry and the user cannot drag it back.
        if (!Float.isFinite(finalX)
                || !Float.isFinite(finalY)
                || !Float.isFinite(finalW)
                || !Float.isFinite(finalH)) {
            log.warn(
                    "Widget coordinates are not finite for field '{}': page={}, x={}, y={}, w={}, h={}",
                    field.getFullyQualifiedName(),
                    pageIndex,
                    finalX,
                    finalY,
                    finalW,
                    finalH);
            return null;
        }
        if (finalX < 0 || finalY < 0 || finalX > cropBox.getWidth() || finalY > cropHeight) {
            log.debug(
                    "Widget for field '{}' sits outside page {}",
                    field.getFullyQualifiedName(),
                    pageIndex);
        }

        return FormFieldWithCoordinates.WidgetCoordinates.builder()
                .pageIndex(pageIndex)
                .x(finalX)
                .y(finalY)
                .width(finalW)
                .height(finalH)
                .exportValue(exportValue)
                .fontSize(extractFontSize(field))
                .cropBoxHeight(cropHeight)
                .build();
    }

    /**
     * Repairs widgets with missing page references by scanning all pages and setting the /P entry
     * for orphan widgets.
     *
     * <p>This should be called BEFORE extracting form field coordinates.
     *
     * @param document PDF document to repair
     */
    /**
     * PDFBox reads /Opt entries without following references, so an option stored indirectly - as
     * real forms do - silently disappears. Resolving in place keeps the value and the reader
     * honest.
     */
    private void resolveIndirectChoiceOptions(PDAcroForm acroForm) {
        try {
            for (PDField field : acroForm.getFieldTree()) {
                if (!(field instanceof PDChoice)) {
                    continue;
                }
                COSBase raw = field.getCOSObject().getDictionaryObject(COSName.OPT);
                if (!(raw instanceof COSArray options)) {
                    continue;
                }
                for (int i = 0; i < options.size(); i++) {
                    COSBase resolved = options.getObject(i);
                    if (resolved != null && resolved != options.get(i)) {
                        options.set(i, resolved);
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Could not resolve indirect choice options: {}", e.getMessage());
        }
    }

    public void repairMissingWidgetPageReferences(PDDocument document) {
        try {
            PDAcroForm acroForm = getAcroFormSafely(document);
            if (acroForm == null) {
                return;
            }
            resolveIndirectChoiceOptions(acroForm);

            log.debug("Checking for widgets with missing page references...");
            int repairedCount = 0;

            Map<COSDictionary, Integer> annotationPageMap = buildAnnotationPageMap(document);

            for (PDField field : acroForm.getFieldTree()) {
                if (!(field instanceof PDTerminalField terminalField)) {
                    continue;
                }

                List<PDAnnotationWidget> widgets = terminalField.getWidgets();

                if (widgets == null || widgets.isEmpty()) {
                    continue;
                }

                for (PDAnnotationWidget widget : widgets) {
                    if (widget.getPage() == null) {
                        Integer pageIndex = annotationPageMap.get(widget.getCOSObject());
                        if (pageIndex != null && pageIndex >= 0) {
                            PDPage foundPage = document.getPage(pageIndex);
                            widget.setPage(foundPage);
                            repairedCount++;
                            log.debug(
                                    "Repaired widget for field '{}' - set page reference via map",
                                    field.getFullyQualifiedName());
                        } else {
                            log.warn(
                                    "Could not find page for widget in field '{}'",
                                    field.getFullyQualifiedName());
                        }
                    }
                }
            }

            if (repairedCount > 0) {
                log.debug(
                        "Successfully repaired {} widgets with missing page references",
                        repairedCount);
            } else {
                log.debug("No widgets needed repair");
            }

        } catch (Exception e) {
            log.error("Error repairing widget page references: {}", e.getMessage(), e);
        }
    }

    private int findPageIndexForAnnotation(
            PDDocument document,
            COSDictionary annotDict,
            Map<COSDictionary, Integer> annotationPageMap) {
        try {
            // Method 0: Check the pre-built lookup map (fastest)
            if (annotationPageMap != null) {
                Integer idx = annotationPageMap.get(annotDict);
                if (idx != null) {
                    return idx;
                }
            }

            // Method 1: Check the /P entry if it points to a page
            COSBase base = annotDict.getDictionaryObject(COSName.P);
            COSDictionary pageDict = (base instanceof COSDictionary c) ? c : null;
            if (pageDict != null) {
                for (int i = 0; i < document.getNumberOfPages(); i++) {
                    if (document.getPage(i).getCOSObject() == pageDict) {
                        return i;
                    }
                }
            }

            // Method 2: Fallback search through all pages' annotations
            for (int i = 0; i < document.getNumberOfPages(); i++) {
                PDPage page = document.getPage(i);
                List<PDAnnotation> annotations = page.getAnnotations();
                if (annotations != null) {
                    for (PDAnnotation annot : annotations) {
                        if (annot != null && annot.getCOSObject() == annotDict) {
                            return i;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.trace("Error finding page for annotation: {}", e.getMessage());
        }
        return -1;
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
            Object value =
                    switch (type) {
                        case FIELD_TYPE_CHECKBOX ->
                                isChecked(info.value()) ? Boolean.TRUE : Boolean.FALSE;
                        case FIELD_TYPE_LISTBOX ->
                                info.multiSelect() ? new ArrayList<>() : safeDefault(info.value());
                        case FIELD_TYPE_BUTTON, FIELD_TYPE_SIGNATURE -> null;
                        default -> safeDefault(info.value());
                    };
            if (value == null) {
                continue; // skip non-fillable
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
                flattenEntireDocument(document, null, false, false);
            }
            return;
        }

        boolean valuesProvided = values != null && !values.isEmpty();
        boolean valuesApplied = false;
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
                valuesApplied = true;
            }

            if (valuesApplied) {
                ensureAppearances(acroForm);
            }
        }

        repairWidgetGeometry(document, acroForm);

        if (flatten) {
            flattenEntireDocument(document, acroForm, valuesApplied, valuesProvided);
        }
    }

    // Cap the fallback rendering DPI. This path only runs when acroForm.flatten()
    // throws, and the goal is a readable flattened document — not print quality —
    // so clamping avoids runaway memory/CPU on pathological inputs.
    private static final int FLATTEN_FALLBACK_MAX_DPI = 200;

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
        renderer.setSubsamplingAllowed(true); // Enable subsampling to reduce memory usage
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);

        int requestedDpi =
                properties != null && properties.getSystem() != null
                        ? properties.getSystem().getMaxDPI()
                        : 300;
        int effectiveDpi = Math.min(requestedDpi, FLATTEN_FALLBACK_MAX_DPI);

        rebuildDocumentFromImages(document, renderer, effectiveDpi);
    }

    // Use PDFBox's built-in field flattening which bakes form field values
    // into the page content stream as static text/graphics, removing the
    // interactive form structure but preserving all other document content
    // (images, text, annotations, etc.) at full quality.
    //
    // Forcing appearance regeneration via setNeedAppearances(true) drives
    // PDFBox into refreshAppearances inside flatten(), where it can hang on
    // certain documents (PDFBOX-5962). We therefore only regenerate when we
    // actually wrote new values, or when the request included values and the
    // document has widgets without appearance streams.
    private void flattenEntireDocument(
            PDDocument document, PDAcroForm acroForm, boolean valuesWritten, boolean valuesProvided)
            throws IOException {
        if (document == null || acroForm == null) {
            return;
        }

        if (valuesWritten || (valuesProvided && hasWidgetWithoutAppearance(acroForm))) {
            ensureAppearances(acroForm);
        } else {
            acroForm.setNeedAppearances(false);
        }

        try {
            acroForm.flatten();
        } catch (Exception e) {
            log.warn(
                    "PDFBox acroForm.flatten() failed, falling back to rendering: {}",
                    e.getMessage(),
                    e);
            flattenViaRendering(document, acroForm);
        }
    }

    private boolean hasWidgetWithoutAppearance(PDAcroForm acroForm) {
        for (PDField field : acroForm.getFieldTree()) {
            if (!(field instanceof PDTerminalField terminalField)) {
                continue;
            }
            List<PDAnnotationWidget> widgets = terminalField.getWidgets();
            if (widgets == null) {
                continue;
            }
            for (PDAnnotationWidget widget : widgets) {
                if (widget == null) {
                    continue;
                }
                PDAppearanceDictionary appearance = widget.getAppearance();
                if (appearance == null || appearance.getNormalAppearance() == null) {
                    return true;
                }
            }
        }
        return false;
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
                    page = resolveWidgetPage(document, widget, null);
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
        ensureAppearances(acroForm, null, false);
    }

    /**
     * With {@code onlyFields} non-null, regenerates appearances for just those fields; {@code
     * preserveNeedAppearances} then keeps the viewer-side generation flag set for the untouched
     * pre-existing fields that still rely on it.
     */
    private void ensureAppearances(
            PDAcroForm acroForm, List<PDField> onlyFields, boolean preserveNeedAppearances) {
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
                    // Both spellings: a DA naming a font missing from /DR makes
                    // refreshAppearances throw for the whole form, not just that field.
                    dr.put(COSName.getPDFName("Helv"), helvetica);
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
            if (onlyFields != null) {
                if (!onlyFields.isEmpty()) {
                    acroForm.refreshAppearances(onlyFields);
                }
            } else {
                acroForm.refreshAppearances();
            }
        } catch (IOException e) {
            log.warn("Failed to refresh form appearances: {}", e.getMessage(), e);
            return; // Don't set NeedAppearances to false if refresh failed
        }

        // Pre-existing fields that were not refreshed may still rely on viewer-side generation.
        if (onlyFields != null && preserveNeedAppearances) {
            return;
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

    /**
     * Create new AcroForm fields from a list of definitions (used by Auto Form Detection). Reuses
     * the same field-creation and appearance logic as the rest of this class, and creates the
     * AcroForm (with a Helvetica default resource) when the document has none. Field names are made
     * unique against any existing fields.
     */
    public void addFields(PDDocument document, List<NewFormFieldDefinition> definitions)
            throws IOException {
        if (document == null || definitions == null || definitions.isEmpty()) {
            return;
        }
        PDDocumentCatalog documentCatalog = document.getDocumentCatalog();
        PDAcroForm acroForm = documentCatalog.getAcroForm();
        boolean priorNeedAppearances =
                acroForm != null && Boolean.TRUE.equals(acroForm.getNeedAppearances());
        if (acroForm == null) {
            acroForm = new PDAcroForm(document);
            PDResources dr = new PDResources();
            dr.put(COSName.getPDFName("Helv"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            acroForm.setDefaultResources(dr);
            acroForm.setNeedAppearances(true);
            documentCatalog.setAcroForm(acroForm);
        }

        Set<String> existingNames = new java.util.HashSet<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (field.getPartialName() != null) {
                existingNames.add(field.getPartialName());
            }
        }

        int pageCount = document.getNumberOfPages();
        List<PDField> createdFields = new ArrayList<>();
        List<Map.Entry<String, NewFormFieldDefinition>> createdButtons = new ArrayList<>();
        for (NewFormFieldDefinition definition : definitions) {
            Integer pageIndex = definition.pageIndex();
            if (pageIndex == null
                    || pageIndex < 0
                    || pageIndex >= pageCount
                    || definition.x() == null
                    || definition.y() == null
                    || definition.width() == null
                    || definition.height() == null) {
                continue;
            }
            // A degenerate rect would otherwise get a synthetic default rectangle downstream.
            if (definition.width() <= 0 || definition.height() <= 0) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            PDRectangle rectangle =
                    new PDRectangle(
                            definition.x(),
                            definition.y(),
                            definition.width(),
                            definition.height());
            FormFieldTypeSupport handler = FormFieldTypeSupport.forTypeName(definition.type());
            // Coerced by name, not capability: detection results can also be applied client-side
            // with pdf-lib, which cannot create signature widgets, so both paths emit text.
            if (handler == null
                    || handler == FormFieldTypeSupport.SIGNATURE
                    || handler.doesNotsupportsDefinitionCreation()) {
                handler = FormFieldTypeSupport.TEXT;
            }
            String baseName =
                    (definition.name() != null && !definition.name().isBlank())
                            ? definition.name()
                            : handler.typeName() + "_" + (pageIndex + 1);
            String uniqueName = generateUniqueFieldName(baseName, existingNames);
            existingNames.add(uniqueName);
            try {
                createNewField(
                        handler,
                        acroForm,
                        page,
                        rectangle,
                        uniqueName,
                        definition,
                        definition.options());
                PDField created = acroForm.getField(uniqueName);
                if (created != null) {
                    createdFields.add(created);
                    createdButtons.add(Map.entry(uniqueName, definition));
                }
            } catch (Exception e) {
                log.warn("Failed to create detected field '{}': {}", uniqueName, e.getMessage());
            }
        }

        applyButtonAppearances(document, acroForm, createdButtons);
        // Refresh only what we added; regenerating pre-existing fields could alter their look.
        ensureAppearances(acroForm, createdFields, priorNeedAppearances);
    }

    public String filterSingleChoiceSelection(
            String selection, List<String> allowedOptions, String fieldName) {
        if (selection == null || selection.trim().isEmpty()) return null;
        List<String> filtered =
                filterChoiceSelections(List.of(selection), allowedOptions, fieldName);
        return filtered.isEmpty() ? null : filtered.getFirst();
    }

    private void applyValueToField(PDField field, String value, boolean strict) throws IOException {
        try {
            switch (field) {
                case PDTextField textField -> setTextValue(textField, value);
                case PDCheckBox checkBox -> {
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
                }
                case PDRadioButton radioButton -> {
                    if (value != null && !value.isBlank()) {
                        radioButton.setValue(value);
                    }
                }
                case PDChoice choiceField -> applyChoiceValue(choiceField, value);
                case PDPushButton ignored -> log.debug("Ignore Push button");
                case PDSignatureField ignored ->
                        log.debug("Skipping signature field '{}'", field.getFullyQualifiedName());
                case null -> log.warn("Attempted to set value on null field");
                default -> field.setValue(value != null ? value : "");
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
        } catch (IOException | RuntimeException initial) {
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

    public String safeValue(String value) {
        return value != null ? value : "";
    }

    private String safeFieldValue(PDTerminalField field) {
        try {
            // PDChoice.getValueAsString() returns a raw COS string representation
            // that doesn't reliably reflect the selected value. Use getValue()
            // which returns the proper List<String> of selected options.
            if (field instanceof PDChoice choiceField) {
                List<String> selected = choiceField.getValue();
                if (selected == null || selected.isEmpty()) {
                    return null;
                }
                return String.join(",", selected);
            }
            // A signature has no text value; getValueAsString would emit a JVM identity hash that
            // changes on every load, so the same document would describe itself differently.
            if (field instanceof PDSignatureField) {
                return null;
            }
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
            return switch (field) {
                case PDChoice choice -> {
                    LinkedHashSet<String> allowed = new LinkedHashSet<>();
                    List<String> exportValues = choice.getOptionsExportValues();
                    List<String> displayValues = choice.getOptionsDisplayValues();

                    if (exportValues != null) {
                        exportValues.stream()
                                .filter(Objects::nonNull)
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .forEach(allowed::add);
                    }
                    if (displayValues != null) {
                        displayValues.stream()
                                .filter(Objects::nonNull)
                                .map(String::trim)
                                .filter(s -> !s.isEmpty())
                                .forEach(allowed::add);
                    }
                    yield new ArrayList<>(allowed);
                }
                case PDRadioButton radio -> {
                    List<String> exports = radio.getExportValues();
                    yield exports != null && !exports.isEmpty()
                            ? new ArrayList<>(exports)
                            : Collections.emptyList();
                }
                case PDCheckBox checkBox -> {
                    List<String> exports = checkBox.getExportValues();
                    yield exports != null && !exports.isEmpty()
                            ? new ArrayList<>(exports)
                            : Collections.emptyList();
                }
                case null, default -> Collections.emptyList();
            };
        } catch (Exception e) {
            log.debug(
                    "Failed to resolve options for field '{}': {}",
                    field.getFullyQualifiedName(),
                    e.getMessage());
        }
        return Collections.emptyList();
    }

    /**
     * Returns the display-value labels for a choice field's options. For radio / checkbox this
     * returns an empty list (no separate display values). For PDChoice fields, if the PDF provides
     * distinct display values, those are returned; otherwise an empty list (indicating that the
     * export values from {@link #resolveOptions} should be shown directly).
     */
    List<String> resolveDisplayOptions(PDTerminalField field) {
        try {
            if (field instanceof PDChoice choice) {
                List<String> display = choice.getOptionsDisplayValues();
                if (display != null && !display.isEmpty()) {
                    return new ArrayList<>(display);
                }
            }
        } catch (Exception e) {
            log.debug(
                    "Failed to resolve display options for field '{}': {}",
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

    private Float extractFontSize(PDTerminalField field) {
        try {
            String da = null;
            if (field instanceof PDVariableText vt) {
                da = vt.getDefaultAppearance();
            }

            if (da == null || da.isBlank()) {
                // Check parent/acroform default appearance if field's is missing
                PDAcroForm form = field.getAcroForm();
                if (form != null) {
                    da = form.getDefaultAppearance();
                }
            }

            if (da != null && !da.isBlank()) {
                // Standard DA looks like: /Helv 12 Tf 0 g
                // We want the number before 'Tf'
                String[] tokens = WHITESPACE_PATTERN.split(da);
                for (int i = 0; i < tokens.length; i++) {
                    if ("Tf".equals(tokens[i]) && i > 0) {
                        try {
                            float size = Float.parseFloat(tokens[i - 1]);
                            return size > 0 ? size : null;
                        } catch (NumberFormatException ignored) {
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.trace(
                    "Could not extract font size for field '{}': {}",
                    field.getFullyQualifiedName(),
                    e.getMessage());
        }
        return null;
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

        // A clearly meaningful field name describes the whole field and matches
        // the name shown in the editor, so it is the best label.
        String humanized = cleanLabel(humanizeName(name));
        if (humanized != null && !looksGeneric(humanized)) {
            return humanized;
        }

        // An option only beats the name when the name is auto-generated; a human-typed
        // one wins below, so a group named "Choice" does not read as its first option.
        if (CHOICE_FIELD_TYPES.contains(type)
                && options != null
                && !options.isEmpty()
                && looksAutoGenerated(name)) {
            String optionCandidate = cleanLabel(options.getFirst());
            if (optionCandidate != null && !looksGeneric(optionCandidate)) {
                return optionCandidate;
            }
        }

        if (humanized != null && !looksAutoGenerated(name)) {
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

        // Detect UUID-like hex strings (e.g. "cdc47b7041524571 7b2d93017fe77bf7")
        // Standard UUIDs are 32 hex characters; require at least that to avoid
        // false positives on short hex-like field names.
        String nospaces = WHITESPACE_PATTERN.matcher(simplified).replaceAll("");
        if (nospaces.length() >= 32 && HEX_UUID_PATTERN.matcher(nospaces).matches()) return true;

        return patterns.getGenericFieldNamePattern().matcher(simplified).matches()
                || patterns.getSimpleFormFieldPattern().matcher(simplified).matches()
                || patterns.getOptionalTNumericPattern().matcher(simplified).matches();
    }

    /**
     * True only for auto-generated identifiers ("Field_5", "t3", UUIDs). Unlike {@link
     * #looksGeneric} it keeps human-typed placeholders like "Choice", which are usable labels.
     */
    private boolean looksAutoGenerated(String value) {
        if (value == null) return true;

        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        String simplified = patterns.getPunctuationPattern().matcher(value).replaceAll(" ").trim();
        if (simplified.isEmpty()) return true;

        String nospaces = WHITESPACE_PATTERN.matcher(simplified).replaceAll("");
        if (nospaces.length() >= 32 && HEX_UUID_PATTERN.matcher(nospaces).matches()) return true;

        return patterns.getPattern("^field(\\s*\\d+)?$", Pattern.CASE_INSENSITIVE)
                        .matcher(simplified)
                        .matches()
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
        modifyFormFields(document, modifications, null);
    }

    public void modifyFormFields(
            PDDocument document,
            List<ModifyFormFieldDefinition> modifications,
            List<SkippedFieldEdit> skipped) {
        if (document == null || modifications == null || modifications.isEmpty()) return;

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            log.warn("Cannot modify fields because the document has no AcroForm");
            for (ModifyFormFieldDefinition modification : modifications) {
                if (modification != null) {
                    recordSkip(
                            skipped,
                            "modify",
                            modification.targetName(),
                            "the document has no form to modify");
                }
            }
            return;
        }

        Set<String> existingNames = collectExistingFieldNames(acroForm);

        for (ModifyFormFieldDefinition modification : modifications) {
            if (modification == null) {
                continue;
            }

            String lookupName =
                    modification.targetName() == null ? "" : modification.targetName().trim();
            if (lookupName.isEmpty()) {
                recordSkip(skipped, "modify", null, "the request named no field to change");
                continue;
            }

            String nameProblem = renameProblem(lookupName, modification.name());
            if (nameProblem != null) {
                log.warn("Rejecting rename of '{}': {}", sanitizeForLog(lookupName), nameProblem);
                recordSkip(skipped, "modify", lookupName, nameProblem);
                continue;
            }

            PDField originalField = locateField(acroForm, lookupName);
            if (originalField == null) {
                log.warn("No matching field '{}' found for modification", lookupName);
                recordSkip(skipped, "modify", lookupName, "no field with that name exists");
                continue;
            }

            List<PDAnnotationWidget> widgets = originalField.getWidgets();
            if (widgets == null || widgets.isEmpty()) {
                log.warn("Field '{}' has no widgets; skipping modification", lookupName);
                recordSkip(skipped, "modify", lookupName, "the field has nothing drawn on a page");
                continue;
            }

            PDAnnotationWidget widget = widgets.getFirst();
            PDRectangle originalRectangle = cloneRectangle(widget.getRectangle());
            PDPage page = resolveWidgetPage(document, widget, null);
            if (page == null || originalRectangle == null) {
                log.warn(
                        "Unable to resolve widget page or rectangle for '{}'; skipping",
                        lookupName);
                recordSkip(
                        skipped, "modify", lookupName, "the field is not placed on a known page");
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
                recordSkip(
                        skipped,
                        "modify",
                        lookupName,
                        "'" + abbreviate(resolvedType, 60) + "' is not a supported field type");
                continue;
            }

            String desiredName =
                    Optional.ofNullable(modification.name())
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            // The editor seeds the box with the qualified name, so a submission
                            // equal to it is not a rename; keep the field's own partial name.
                            .filter(name -> !name.equals(lookupName))
                            .map(name -> leafName(lookupName, name))
                            .orElseGet(originalField::getPartialName);

            String qualified = originalField.getFullyQualifiedName();
            // desiredName is a PARTIAL name but existingNames holds qualified ones, so compare
            // under this field's own parent or siblings collide unnoticed.
            String prefix = parentPrefix(qualified);
            String reservedName = null;
            if (desiredName != null) {
                existingNames.remove(qualified);
                desiredName = generateUniqueFieldName(desiredName, existingNames, prefix);
                reservedName = prefix + desiredName;
                existingNames.add(reservedName);
            }

            // Try to modify field in-place first for simple property changes
            String currentType = detectFieldType(originalField);
            boolean typeChanging = !currentType.equals(resolvedType);

            if (!typeChanging) {
                try {
                    modifyFieldPropertiesInPlace(
                            document, originalField, modification, desiredName, skipped);
                    log.debug("Successfully modified field '{}' in-place", lookupName);
                    continue; // Skip the remove-and-recreate process
                } catch (Exception e) {
                    log.debug(
                            "In-place modification failed for '{}', falling back to recreation: {}",
                            sanitizeForLog(lookupName),
                            e.getMessage());
                }
            }

            // Recreation always builds a top-level field, so running it on a field nested under a
            // parent would silently move it out of that parent and change its qualified name.
            if (!prefix.isEmpty()) {
                log.warn("Cannot recreate nested field '{}'; leaving it as it was", lookupName);
                recordSkip(skipped, "modify", lookupName, refusalReason(typeChanging));
                releaseReservedName(existingNames, reservedName, qualified);
                continue;
            }

            // For type changes or when in-place modification fails, use remove-and-recreate
            // But create the new field first to ensure success before removing the original
            NewFormFieldDefinition replacementDefinition =
                    new NewFormFieldDefinition(
                            desiredName,
                            modification.label(),
                            resolvedType,
                            determineWidgetPageIndex(document, widget, null),
                            originalRectangle.getLowerLeftX(),
                            originalRectangle.getLowerLeftY(),
                            originalRectangle.getWidth(),
                            originalRectangle.getHeight(),
                            modification.required(),
                            modification.multiSelect(),
                            modification.options(),
                            modification.defaultValue(),
                            modification.tooltip(),
                            modification.fontSize(),
                            modification.readOnly(),
                            modification.multiline(),
                            modification.maxLength(),
                            modification.buttonAction());

            List<String> sanitizedOptions = sanitizeOptions(modification.options());

            FormFieldTypeSupport handler = FormFieldTypeSupport.forTypeName(resolvedType);
            if (handler == null || handler.doesNotsupportsDefinitionCreation()) {
                // Falling back to a text field here would silently retype the field and report
                // success, so refuse instead and leave the original alone.
                recordSkip(
                        skipped,
                        "modify",
                        lookupName,
                        "'"
                                + resolvedType
                                + "' cannot be rebuilt, so the field was left as it was");
                releaseReservedName(existingNames, reservedName, qualified);
                continue;
            }

            try {
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

                // A rebuilt toggle has no /AP yet, so without this it renders blank and cannot
                // tick.
                applyButtonAppearances(
                        document,
                        acroForm,
                        List.of(Map.entry(prefix + desiredName, replacementDefinition)));

                log.debug(
                        "Successfully replaced field '{}' with type '{}'",
                        sanitizeForLog(lookupName),
                        resolvedType);
            } catch (Exception e) {
                log.warn(
                        "Failed to modify form field '{}' to type '{}': {}",
                        sanitizeForLog(lookupName),
                        resolvedType,
                        e.getMessage(),
                        e);
                recordSkip(skipped, "modify", lookupName, readableFailure(e));
                releaseReservedName(existingNames, reservedName, qualified);
            }
        }

        ensureAppearances(acroForm);
    }

    /** Nothing was applied, so give the field back its real name and drop the one we reserved. */
    private void releaseReservedName(
            Set<String> existingNames, String reservedName, String originalQualifiedName) {
        if (reservedName != null) {
            existingNames.remove(reservedName);
        }
        if (originalQualifiedName != null) {
            existingNames.add(originalQualifiedName);
        }
    }

    /** Why the edit was refused, which is not always the type change that triggered the path. */
    private String refusalReason(boolean typeChanging) {
        return typeChanging
                ? "a field nested under a parent cannot have its type changed here"
                : "this change needs the field rebuilt, which a nested field does not support";
    }

    private void modifyFieldPropertiesInPlace(
            PDDocument document,
            PDField field,
            ModifyFormFieldDefinition modification,
            String newName,
            List<SkippedFieldEdit> skipped)
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
        } else if (modification.options() != null && !(field instanceof PDChoice)) {
            // Only a choice field stores an option list, so say so rather than drop the edit and
            // let the panel report it as saved.
            recordSkip(
                    skipped,
                    "modify",
                    field.getFullyQualifiedName(),
                    "only dropdown and list fields have an editable option list");
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

        // Update read-only flag
        if (modification.readOnly() != null) {
            field.setReadOnly(modification.readOnly());
        }

        // Update multiline flag (text fields only)
        if (modification.multiline() != null && field instanceof PDTextField tf) {
            tf.setMultiline(modification.multiline());
        }

        // Update the activation action (push buttons only)
        if (modification.buttonAction() != null && field instanceof PDPushButton) {
            String actionProblem = null;
            for (PDAnnotationWidget widget : field.getWidgets()) {
                String problem =
                        FormFieldTypeSupport.applyButtonAction(widget, modification.buttonAction());
                if (problem != null && actionProblem == null) {
                    actionProblem = problem;
                }
            }
            if (actionProblem != null) {
                recordSkip(skipped, "modify", field.getFullyQualifiedName(), actionProblem);
            }
        }

        // Update comb / max length (text fields only). Zero clears it, since a null means
        // "unchanged" and the editor otherwise has no way to remove an existing /MaxLen.
        if (modification.maxLength() != null && field instanceof PDTextField combTf) {
            int maxLength = modification.maxLength();
            if (maxLength > 0) {
                combTf.setMaxLen(maxLength);
                if (!combTf.isMultiline()) {
                    try {
                        combTf.setComb(true);
                    } catch (Exception ignore) {
                        // comb is best-effort
                    }
                }
            } else {
                combTf.getCOSObject().removeItem(COSName.MAX_LEN);
                try {
                    combTf.setComb(false);
                } catch (Exception ignore) {
                    // comb is best-effort
                }
            }
        }

        // Update font size (variable-text fields only: text/combo/list)
        if (modification.fontSize() != null
                && modification.fontSize() > 0
                && field instanceof PDVariableText vt) {
            applyFontSizeToDefaultAppearance(vt, modification.fontSize());
            // Clear the cached appearance so ensureAppearances() regenerates it
            // with the new font size; otherwise viewers keep the old glyph sizing.
            removeWidgetAppearanceStreams(field);
        }

        // Incoming coordinates are CropBox-relative and lower-left-origin, the reverse
        // of what createWidgetCoordinates extracts.
        if (modification.x() != null
                || modification.y() != null
                || modification.width() != null
                || modification.height() != null
                || modification.optionGap() != null
                || modification.optionSize() != null) {
            updateWidgetGeometry(document, field, modification, skipped);
        }
    }

    /**
     * Moves/resizes a field's widgets. The rect describes widget 0; the rest shift by the same
     * delta and keep their own size, so a radio group travels intact instead of being normalised.
     */
    /** A size PDFBox would write as "Infinity" or a zero-area box makes the field unusable. */
    private static boolean unusableSize(Float value) {
        return value != null && (!Float.isFinite(value) || value <= 0);
    }

    /** The rectangle enclosing every widget, or null when none has one. */
    private static PDRectangle widgetBounds(List<PDAnnotationWidget> widgets) {
        float minX = Float.MAX_VALUE;
        float minY = Float.MAX_VALUE;
        float maxX = -Float.MAX_VALUE;
        float maxY = -Float.MAX_VALUE;
        boolean any = false;
        for (PDAnnotationWidget widget : widgets) {
            PDRectangle r = widget.getRectangle();
            if (r == null) continue;
            any = true;
            minX = Math.min(minX, r.getLowerLeftX());
            minY = Math.min(minY, r.getLowerLeftY());
            maxX = Math.max(maxX, r.getUpperRightX());
            maxY = Math.max(maxY, r.getUpperRightY());
        }
        return any ? new PDRectangle(minX, minY, maxX - minX, maxY - minY) : null;
    }

    private void updateWidgetGeometry(
            PDDocument document,
            PDField field,
            ModifyFormFieldDefinition modification,
            List<SkippedFieldEdit> skipped) {
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null || widgets.isEmpty()) {
            return;
        }
        if (unusableSize(modification.width()) || unusableSize(modification.height())) {
            recordSkip(
                    skipped,
                    "modify",
                    field.getFullyQualifiedName(),
                    "a width and height above zero are required, so the size was left as it was");
            return;
        }
        if (modification.x() != null && !Float.isFinite(modification.x())
                || modification.y() != null && !Float.isFinite(modification.y())) {
            recordSkip(
                    skipped,
                    "modify",
                    field.getFullyQualifiedName(),
                    "the position is not a usable number, so the field was left where it was");
            return;
        }
        PDAnnotationWidget anchor = widgets.get(0);
        PDRectangle anchorRect = anchor.getRectangle();
        if (anchorRect == null) {
            return;
        }

        Map<COSDictionary, Integer> pageMap = buildAnnotationPageMap(document);
        int anchorPage = determineWidgetPageIndex(document, anchor, pageMap);
        float offX = 0;
        float offY = 0;
        if (anchorPage >= 0) {
            PDRectangle cropBox = document.getPage(anchorPage).getCropBox();
            offX = cropBox.getLowerLeftX();
            offY = cropBox.getLowerLeftY();
        }

        float newX =
                modification.x() != null ? modification.x() + offX : anchorRect.getLowerLeftX();
        float newY =
                modification.y() != null ? modification.y() + offY : anchorRect.getLowerLeftY();
        float dx = newX - anchorRect.getLowerLeftX();
        float dy = newY - anchorRect.getLowerLeftY();
        Float newW = modification.width();
        Float newH = modification.height();

        // Spacing and size are a property of the whole group, so an explicit change re-flows
        // every option. Gated on those two: a plain drag sends widget 0's size, which would be
        // mistaken for the group's height and collapse the stack.
        if ((modification.optionGap() != null || modification.optionSize() != null)
                && field instanceof PDRadioButton
                && widgets.size() > 1) {
            PDRectangle bounds = widgetBounds(widgets);
            if (bounds != null) {
                PDRectangle box =
                        new PDRectangle(
                                bounds.getLowerLeftX() + dx,
                                bounds.getLowerLeftY() + dy,
                                modification.width() != null
                                        ? modification.width()
                                        : bounds.getWidth(),
                                modification.height() != null
                                        ? modification.height()
                                        : bounds.getHeight());
                List<PDRectangle> reflowed =
                        radioOptionRects(
                                box,
                                widgets.size(),
                                modification.optionGap(),
                                modification.optionSize());
                List<String> groupStates = currentWidgetOnStates((PDButton) field);
                for (int i = 0; i < widgets.size(); i++) {
                    widgets.get(i).setRectangle(reflowed.get(i));
                    rebuildWidgetAppearance(document, field, widgets.get(i), i, groupStates, true);
                }
                return;
            }
        }

        // Read the on-states off /AP /N before the strip: PDFBox derives a button's
        // value vocabulary from those keys, so a guessed state orphans /V.
        List<String> onStates =
                field instanceof PDButton button ? currentWidgetOnStates(button) : List.of();
        boolean isRadio = field instanceof PDRadioButton;

        int leftOffPage = 0;
        for (int i = 0; i < widgets.size(); i++) {
            PDAnnotationWidget widget = widgets.get(i);
            PDRectangle rect = widget.getRectangle();
            if (rect == null) {
                continue;
            }
            if (i > 0 && determineWidgetPageIndex(document, widget, pageMap) != anchorPage) {
                // A delta measured in another page's user space means nothing here.
                log.warn(
                        "Field '{}' widget {} sits on a different page; geometry left alone",
                        field.getFullyQualifiedName(),
                        i);
                leftOffPage++;
                continue;
            }
            // Only the widget the request describes takes the new size; the rest keep theirs.
            float targetW = i == 0 && newW != null ? newW : rect.getWidth();
            float targetH = i == 0 && newH != null ? newH : rect.getHeight();
            boolean resized =
                    Math.abs(targetW - rect.getWidth()) > GEOMETRY_EPSILON_PT
                            || Math.abs(targetH - rect.getHeight()) > GEOMETRY_EPSILON_PT;
            widget.setRectangle(
                    new PDRectangle(
                            rect.getLowerLeftX() + dx,
                            rect.getLowerLeftY() + dy,
                            targetW,
                            targetH));
            // A pure translation re-maps the same /AP onto the new /Rect unchanged, but a toggle
            // with no /AP at all has no on-state vocabulary and must be given one regardless.
            boolean toggle = field instanceof PDCheckBox || field instanceof PDRadioButton;
            if (resized || (toggle && normalAppearanceOnState(widget) == null)) {
                rebuildWidgetAppearance(document, field, widget, i, onStates, isRadio);
            }
        }
        // One row per field, not per widget, so a split group cannot fill the report on its own.
        if (leftOffPage > 0) {
            recordSkip(
                    skipped,
                    "modify",
                    field.getFullyQualifiedName(),
                    leftOffPage + " widget(s) on another page were left where they were");
        }
    }

    /** After a resize, rebuilds the appearance PDFBox cannot regenerate by itself. */
    private void rebuildWidgetAppearance(
            PDDocument document,
            PDField field,
            PDAnnotationWidget widget,
            int index,
            List<String> onStates,
            boolean isRadio) {
        if (field instanceof PDSignatureField) {
            // PDFBox never rebuilds a signature appearance; dropping it blanks the field.
            return;
        }
        COSName priorState = widget.getCOSObject().getCOSName(COSName.AS);
        try {
            if (field instanceof PDCheckBox || field instanceof PDRadioButton) {
                // Drop the stale streams: viewers stretch an /AP built for the old BBox
                // onto the new /Rect, so a resized toggle looks distorted.
                widget.getCOSObject().removeItem(COSName.AP);
                String onState =
                        index < onStates.size() ? onStates.get(index) : DEFAULT_CHECKBOX_ON_STATE;
                applyToggleAppearance(document, widget, onState, isRadio);
                // applyToggleAppearance parks the widget on Off; put the selection back.
                if (priorState != null && !OFF_STATE.equals(priorState.getName())) {
                    widget.getCOSObject().setName(COSName.AS, onState);
                }
            } else if (field instanceof PDPushButton) {
                // /D and /R still carry the old BBox and cannot be regenerated, so drop them
                // rather than leave a stretched down-state; viewers fall back to /N.
                PDAppearanceDictionary existing = widget.getAppearance();
                if (existing != null) {
                    existing.getCOSObject().removeItem(COSName.D);
                    existing.getCOSObject().removeItem(COSName.R);
                }
                applyPushButtonAppearance(document, widget);
            } else {
                // text/choice: refreshAppearances() rebuilds these from /DA in ensureAppearances().
                widget.getCOSObject().removeItem(COSName.AP);
            }
        } catch (Exception e) {
            log.warn(
                    "Could not rebuild the appearance for '{}' widget {}: {}",
                    field.getFullyQualifiedName(),
                    index,
                    e.getMessage());
        }
    }

    /** Rewrites only the size token in a variable-text field's /DA, keeping font and colour. */
    private void applyFontSizeToDefaultAppearance(PDVariableText field, float fontSize) {
        String da = field.getDefaultAppearance();
        if (da != null && !da.isBlank()) {
            // Replace the size token (the operand immediately before "Tf").
            String[] tokens = da.split("\\s+");
            boolean replaced = false;
            for (int i = 0; i < tokens.length; i++) {
                if ("Tf".equals(tokens[i]) && i > 0) {
                    tokens[i - 1] = String.valueOf(fontSize);
                    replaced = true;
                    break;
                }
            }
            if (replaced) {
                field.setDefaultAppearance(String.join(" ", tokens));
                return;
            }
        }
        field.setDefaultAppearance("/Helv " + fontSize + " Tf 0 g");
    }

    /** Drops cached /AP appearance streams from every widget of a field. */
    private void removeWidgetAppearanceStreams(PDField field) {
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null) {
            return;
        }
        for (PDAnnotationWidget widget : widgets) {
            widget.getCOSObject().removeItem(COSName.AP);
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

    private int resolveFirstWidgetPageIndex(
            PDDocument document,
            PDTerminalField field,
            Map<COSDictionary, Integer> annotationPageMap) {
        List<PDAnnotationWidget> widgets = field.getWidgets();
        if (widgets == null || widgets.isEmpty()) {
            return -1;
        }
        for (PDAnnotationWidget widget : widgets) {
            int idx = resolveWidgetPageIndex(document, widget, annotationPageMap);
            if (idx >= 0) {
                return idx;
            }
        }
        return -1;
    }

    private int resolveWidgetPageIndex(
            PDDocument document,
            PDAnnotationWidget widget,
            Map<COSDictionary, Integer> annotationPageMap) {
        if (document == null || widget == null) {
            return -1;
        }

        // Method 0: Check the pre-built lookup map (fastest)
        if (annotationPageMap != null) {
            Integer idx = annotationPageMap.get(widget.getCOSObject());
            if (idx != null) {
                return idx;
            }
        }

        try {
            PDPage page = widget.getPage();
            if (page != null) {
                // indexOf is O(N), still slower than map but better than scanning annotations
                int idx = document.getPages().indexOf(page);
                if (idx >= 0) {
                    return idx;
                }
            }
        } catch (Exception e) {
            log.debug("Widget page lookup failed: {}", e.getMessage());
        }

        // Method 1: Check the /P entry if it points to a page
        try {
            COSDictionary widgetDictionary = widget.getCOSObject();
            if (widgetDictionary != null) {
                COSBase base = widgetDictionary.getDictionaryObject(COSName.P);
                COSDictionary pageDict = (base instanceof COSDictionary c) ? c : null;
                if (pageDict != null) {
                    for (int i = 0; i < document.getNumberOfPages(); i++) {
                        if (document.getPage(i).getCOSObject() == pageDict) {
                            return i;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Widget page lookup via /P entry failed: {}", e.getMessage());
        }

        // Method 2: Fallback search through all pages' annotations
        int pageCount = document.getNumberOfPages();
        COSDictionary widgetDict = widget.getCOSObject();
        for (int i = 0; i < pageCount; i++) {
            try {
                PDPage candidate = document.getPage(i);
                List<PDAnnotation> annotations = candidate.getAnnotations();
                if (annotations != null) {
                    for (PDAnnotation annot : annotations) {
                        if (annot != null && annot.getCOSObject() == widgetDict) {
                            return i;
                        }
                    }
                }
            } catch (IOException e) {
                log.debug("Failed to inspect annotations for page {}: {}", i, e.getMessage());
            }
        }
        return -1;
    }

    /**
     * Adds fields, creating an AcroForm if absent. Definition coordinates are CropBox-relative and
     * lower-left-origin (the inverse of {@link #createWidgetCoordinates}).
     */
    public void addNewFields(PDDocument document, List<NewFormFieldDefinition> definitions)
            throws IOException {
        addNewFields(document, definitions, null);
    }

    /**
     * A form with variable-text fields needs /DR and /DA; PDFBox refuses to set a value without
     * them, and a PDF that never had a form has neither.
     */
    private void ensureAcroFormDefaults(PDAcroForm acroForm) {
        if (acroForm == null) return;
        try {
            PDResources dr = acroForm.getDefaultResources();
            if (dr == null) {
                dr = new PDResources();
                acroForm.setDefaultResources(dr);
            }
            String resourceName = "Helv";
            COSName alias = dr.add(new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            if (alias != null && alias.getName() != null && !alias.getName().isBlank()) {
                resourceName = alias.getName();
            }
            String da = acroForm.getDefaultAppearance();
            if (da == null || da.isBlank()) {
                acroForm.setDefaultAppearance("/" + resourceName + " 12 Tf 0 g");
            }
        } catch (Exception e) {
            log.debug("Could not prepare AcroForm defaults: {}", e.getMessage());
        }
    }

    public void addNewFields(
            PDDocument document,
            List<NewFormFieldDefinition> definitions,
            List<SkippedFieldEdit> skipped)
            throws IOException {
        if (document == null || definitions == null || definitions.isEmpty()) return;
        // A page-less document has nowhere to put a widget; the clamp below cannot make it safe.
        if (document.getNumberOfPages() == 0) {
            log.warn("Cannot add form fields: document has no pages");
            for (NewFormFieldDefinition definition : definitions) {
                if (definition != null) {
                    recordSkip(skipped, "add", definition.name(), "the document has no pages");
                }
            }
            return;
        }

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            // Create a new AcroForm for PDFs that don't have one yet
            acroForm = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(acroForm);
        }
        ensureAcroFormDefaults(acroForm);

        Set<String> existingNames = collectExistingFieldNames(acroForm);
        int pageCount = document.getNumberOfPages();
        // Buttons need their appearances built after creation; see applyButtonAppearances.
        List<Map.Entry<String, NewFormFieldDefinition>> createdButtons = new ArrayList<>();

        for (NewFormFieldDefinition definition : definitions) {
            if (definition == null) continue;

            String nameProblem = invalidFieldNameReason(definition.name());
            if (nameProblem != null) {
                log.warn("Rejecting new field: {}", nameProblem);
                recordSkip(skipped, "add", definition.name(), nameProblem);
                continue;
            }

            String resolvedType =
                    Optional.ofNullable(definition.type())
                            .map(FormUtils::normalizeFieldType)
                            .orElse(FIELD_TYPE_TEXT);

            int pageIdx = definition.pageIndex() != null ? definition.pageIndex() : 0;
            if (pageIdx < 0 || pageIdx >= pageCount) {
                log.warn(
                        "Page index {} out of range (0-{}); clamping to last page",
                        pageIdx,
                        pageCount - 1);
                // Clamped, so the field IS created; not a dropped edit and not reported as one.
                pageIdx = Math.max(0, pageCount - 1);
            }
            PDPage page;
            try {
                page = document.getPage(pageIdx);
            } catch (RuntimeException e) {
                // getNumberOfPages() reports the raw /Count, which a broken /Pages tree can
                // overstate, so the page may still not be there.
                recordSkip(
                        skipped,
                        "add",
                        definition.name(),
                        "page " + (pageIdx + 1) + " could not be read from this PDF");
                continue;
            }
            PDRectangle cropBox = page.getCropBox();

            // CropBox-relative, lower-left-origin -> absolute PDF user space.
            float x = (definition.x() != null ? definition.x() : 0f) + cropBox.getLowerLeftX();
            float y = (definition.y() != null ? definition.y() : 0f) + cropBox.getLowerLeftY();
            float w = definition.width() != null ? definition.width() : 150f;
            float h = definition.height() != null ? definition.height() : 20f;
            PDRectangle rectangle = new PDRectangle(x, y, w, h);

            String baseName =
                    Optional.ofNullable(definition.name())
                            .map(String::trim)
                            .filter(s -> !s.isEmpty())
                            .orElse("field");
            String uniqueName = generateUniqueFieldName(baseName, existingNames);
            existingNames.add(uniqueName);

            List<String> options = sanitizeOptions(definition.options());

            try {
                if (FIELD_TYPE_RADIO.equals(resolvedType)) {
                    // Radio is a single field with one widget per option; it can't go
                    // through the single-widget createNewField path.
                    createRadioField(acroForm, page, rectangle, uniqueName, definition, options);
                } else {
                    FormFieldTypeSupport handler = FormFieldTypeSupport.forTypeName(resolvedType);
                    if (handler == null || handler.doesNotsupportsDefinitionCreation()) {
                        // Quietly making it a text field reported success for a field the
                        // caller never asked for; say so instead.
                        recordSkip(
                                skipped,
                                "add",
                                uniqueName,
                                "'" + resolvedType + "' fields cannot be created");
                        existingNames.remove(uniqueName);
                        continue;
                    }
                    createNewField(
                            handler, acroForm, page, rectangle, uniqueName, definition, options);
                }
                createdButtons.add(Map.entry(uniqueName, definition));
            } catch (Exception e) {
                log.warn(
                        "Failed to create field '{}' of type '{}': {}",
                        sanitizeForLog(uniqueName),
                        resolvedType,
                        e.getMessage(),
                        e);
                recordSkip(skipped, "add", uniqueName, readableFailure(e));
            }
        }

        applyButtonAppearances(document, acroForm, createdButtons);
        ensureAppearances(acroForm);
    }

    /**
     * {@link PDAcroForm#refreshAppearances()} never synthesizes /AP for the button family, and
     * PDFBox reads a button's on-state from the /AP /N keys, so draw them then re-apply the value.
     */
    private void applyButtonAppearances(
            PDDocument document,
            PDAcroForm acroForm,
            List<Map.Entry<String, NewFormFieldDefinition>> created) {
        for (Map.Entry<String, NewFormFieldDefinition> entry : created) {
            PDField field = acroForm.getField(entry.getKey());
            if (field instanceof PDPushButton) {
                for (PDAnnotationWidget widget : field.getWidgets()) {
                    try {
                        applyPushButtonAppearance(document, widget);
                    } catch (Exception e) {
                        log.warn(
                                "Could not build an appearance for button '{}': {}",
                                entry.getKey(),
                                e.getMessage());
                    }
                }
                continue;
            }
            if (!(field instanceof PDCheckBox) && !(field instanceof PDRadioButton)) {
                continue;
            }
            boolean isRadio = field instanceof PDRadioButton;
            List<String> onStates = buttonOnStates((PDButton) field);
            List<PDAnnotationWidget> widgets = field.getWidgets();
            for (int i = 0; i < widgets.size(); i++) {
                String onState = i < onStates.size() ? onStates.get(i) : DEFAULT_CHECKBOX_ON_STATE;
                try {
                    applyToggleAppearance(document, widgets.get(i), onState, isRadio);
                } catch (Exception e) {
                    log.warn(
                            "Could not build an appearance for '{}' widget {}: {}",
                            entry.getKey(),
                            i,
                            e.getMessage());
                }
            }
            applyButtonDefault((PDButton) field, entry.getValue(), onStates);
        }
    }

    /** The on-state per widget: the export values when set, else the single checkbox state. */
    private List<String> buttonOnStates(PDButton button) {
        List<String> exportValues = button.getExportValues();
        if (exportValues != null && !exportValues.isEmpty()) {
            return exportValues;
        }
        return List.of(DEFAULT_CHECKBOX_ON_STATE);
    }

    /** Each widget's live on-state, read from /AP /N before that dictionary is dropped. */
    private List<String> currentWidgetOnStates(PDButton button) {
        List<String> exportValues = button.getExportValues();
        List<PDAnnotationWidget> widgets = button.getWidgets();
        // A checkbox's widgets all share one on-state, so /V names it however many there are.
        // A radio's widgets each have their own, so /V identifies one and cannot stand in.
        boolean sharedOnState = !(button instanceof PDRadioButton);
        String fromValue = sharedOnState || widgets.size() == 1 ? nonOffValueName(button) : null;
        List<String> states = new ArrayList<>(widgets.size());
        for (int i = 0; i < widgets.size(); i++) {
            String state = normalAppearanceOnState(widgets.get(i));
            if ((state == null || state.isEmpty())
                    && exportValues != null
                    && i < exportValues.size()) {
                state = sanitizePdfName(exportValues.get(i));
            }
            if (state == null || state.isEmpty()) {
                state = fromValue;
            }
            states.add(state == null || state.isEmpty() ? DEFAULT_CHECKBOX_ON_STATE : state);
        }
        return states;
    }

    /** A button's current value when it names a real on-state, else null. */
    private String nonOffValueName(PDButton button) {
        try {
            // /V is inheritable, so walk up. A malformed PDF can point /Parent back at an
            // ancestor, so track what we have seen rather than trusting the chain to end.
            COSBase raw = null;
            Set<COSDictionary> seen = Collections.newSetFromMap(new IdentityHashMap<>());
            COSDictionary d = button.getCOSObject();
            while (d != null && raw == null && seen.add(d)) {
                raw = d.getDictionaryObject(COSName.V);
                COSBase parent = d.getDictionaryObject(COSName.PARENT);
                d = parent instanceof COSDictionary parentDict ? parentDict : null;
            }
            String name =
                    switch (raw) {
                        case COSName cosName -> cosName.getName();
                        case COSString cosString -> cosString.getString();
                        case null, default -> null;
                    };
            return name == null || name.isEmpty() || OFF_STATE.equals(name) ? null : name;
        } catch (Exception e) {
            log.debug("Could not read a button's value: {}", e.getMessage());
            return null;
        }
    }

    /** The first non-Off key of a widget's /AP /N sub-dictionary, or null. */
    private String normalAppearanceOnState(PDAnnotationWidget widget) {
        try {
            PDAppearanceDictionary appearance = widget.getAppearance();
            PDAppearanceEntry normal = appearance != null ? appearance.getNormalAppearance() : null;
            if (normal == null || !normal.isSubDictionary()) {
                return null;
            }
            for (COSName name : normal.getSubDictionary().keySet()) {
                if (!OFF_STATE.equals(name.getName())) {
                    return name.getName();
                }
            }
        } catch (Exception e) {
            log.debug("Could not read a widget's on-state: {}", e.getMessage());
        }
        return null;
    }

    /** Re-applies the definition's default now that the on-state keys exist to resolve it. */
    private void applyButtonDefault(
            PDButton button, NewFormFieldDefinition definition, List<String> onStates) {
        try {
            if (button instanceof PDCheckBox checkBox) {
                if (isChecked(definition.defaultValue())) {
                    checkBox.check();
                } else {
                    checkBox.unCheck();
                }
                return;
            }
            String requested = definition.defaultValue();
            if (requested == null || requested.isBlank()) {
                return;
            }
            // The widget states are sanitized PDF names, so match the raw request against those.
            String match =
                    onStates.stream()
                            .filter(
                                    state ->
                                            state.equals(requested)
                                                    || state.equalsIgnoreCase(
                                                            sanitizePdfName(requested)))
                            .findFirst()
                            .orElse(null);
            if (match != null) {
                button.setValue(match);
            }
        } catch (Exception e) {
            log.debug(
                    "Could not apply default value for '{}': {}",
                    button.getPartialName(),
                    e.getMessage());
        }
    }

    /**
     * Builds a toggle's two-state /AP /N from drawing primitives, so no font resource is needed.
     */
    private void applyToggleAppearance(
            PDDocument document, PDAnnotationWidget widget, String onState, boolean isRadio)
            throws IOException {
        PDRectangle rect = widget.getRectangle();
        if (rect == null || rect.getWidth() <= 0 || rect.getHeight() <= 0) {
            return;
        }
        float w = rect.getWidth();
        float h = rect.getHeight();
        PDRectangle bbox = new PDRectangle(w, h);

        PDAppearanceDictionary appearance = new PDAppearanceDictionary();
        COSDictionary normalStates = new COSDictionary();
        normalStates.setItem(
                COSName.getPDFName(OFF_STATE),
                toggleStream(document, bbox, false, false).getCOSObject());
        normalStates.setItem(
                COSName.getPDFName(onState),
                toggleStream(document, bbox, true, isRadio).getCOSObject());
        appearance.getCOSObject().setItem(COSName.N, normalStates);
        widget.setAppearance(appearance);
        // Until a value selects it, the widget shows the Off appearance.
        widget.getCOSObject().setName(COSName.AS, OFF_STATE);
    }

    private PDAppearanceStream toggleStream(
            PDDocument document, PDRectangle bbox, boolean on, boolean isRadio) throws IOException {
        PDAppearanceStream stream = new PDAppearanceStream(document);
        stream.setBBox(bbox);
        stream.setResources(new PDResources());

        float w = bbox.getWidth();
        float h = bbox.getHeight();
        float inset = Math.min(w, h) * 0.1f;
        try (PDPageContentStream content =
                new PDPageContentStream(
                        document, stream, stream.getStream().createOutputStream())) {
            content.setStrokingColor(0f, 0f, 0f);
            content.setNonStrokingColor(0f, 0f, 0f);
            content.setLineWidth(Math.max(0.5f, Math.min(w, h) * 0.06f));
            if (isRadio) {
                drawCircle(content, w / 2, h / 2, Math.min(w, h) / 2 - inset);
                content.stroke();
                if (on) {
                    drawCircle(content, w / 2, h / 2, Math.min(w, h) / 4 - inset / 2);
                    content.fill();
                }
            } else {
                content.addRect(inset, inset, w - 2 * inset, h - 2 * inset);
                content.stroke();
                if (on) {
                    content.moveTo(w * 0.25f, h * 0.5f);
                    content.lineTo(w * 0.45f, h * 0.28f);
                    content.lineTo(w * 0.78f, h * 0.72f);
                    content.stroke();
                }
            }
        }
        return stream;
    }

    /**
     * Draws a push button's single {@code /AP /N} stream from its {@code /MK} characteristics.
     * PDFBox never synthesizes one, so without this a push button has no appearance at all.
     */
    private void applyPushButtonAppearance(PDDocument document, PDAnnotationWidget widget)
            throws IOException {
        PDRectangle rect = widget.getRectangle();
        if (rect == null || rect.getWidth() <= 0 || rect.getHeight() <= 0) {
            return;
        }
        float w = rect.getWidth();
        float h = rect.getHeight();

        PDAppearanceStream stream = new PDAppearanceStream(document);
        stream.setBBox(new PDRectangle(w, h));
        stream.setResources(new PDResources());

        PDAppearanceCharacteristicsDictionary mk = widget.getAppearanceCharacteristics();
        String caption = mk != null ? mk.getNormalCaption() : null;
        // Honour the authored /MK colours; a hardcoded grey would restyle an existing button.
        float[] background = mkColour(mk == null ? null : mk.getBackground(), 0.85f);
        float[] border = mkColour(mk == null ? null : mk.getBorderColour(), 0f);
        PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        float fontSize = Math.min(12f, h * 0.6f);

        try (PDPageContentStream content =
                new PDPageContentStream(
                        document, stream, stream.getStream().createOutputStream())) {
            content.setNonStrokingColor(background[0], background[1], background[2]);
            content.addRect(0, 0, w, h);
            content.fill();
            content.setStrokingColor(border[0], border[1], border[2]);
            content.setLineWidth(1f);
            content.addRect(0.5f, 0.5f, w - 1f, h - 1f);
            content.stroke();
            if (caption != null && !caption.isBlank()) {
                try {
                    float textWidth = font.getStringWidth(caption) / 1000f * fontSize;
                    content.beginText();
                    content.setFont(font, fontSize);
                    content.setNonStrokingColor(0f, 0f, 0f);
                    content.newLineAtOffset(
                            Math.max(2f, (w - textWidth) / 2f),
                            (h - fontSize) / 2f + fontSize * 0.2f);
                    content.showText(caption);
                    content.endText();
                } catch (Exception e) {
                    // Unencodable caption: keep the frame, drop the text.
                    log.debug("Could not draw button caption '{}': {}", caption, e.getMessage());
                }
            }
        }

        // Reuse the existing dictionary so an authored /D or /R is not collateral damage.
        PDAppearanceDictionary appearance = widget.getAppearance();
        if (appearance == null) {
            appearance = new PDAppearanceDictionary();
            widget.setAppearance(appearance);
        }
        appearance.setNormalAppearance(stream);
        // A push button has no value, so no /AS.
        widget.getCOSObject().removeItem(COSName.AS);
    }

    /** A /MK colour array as RGB, falling back to a grey level when absent or unsupported. */
    private float[] mkColour(PDColor colour, float fallback) {
        float[] rgb = {fallback, fallback, fallback};
        if (colour == null) {
            return rgb;
        }
        float[] components;
        try {
            components = colour.getComponents();
        } catch (Exception e) {
            log.debug("Unreadable /MK colour: {}", e.getMessage());
            return rgb;
        }
        if (components.length == 3) {
            rgb = components.clone();
        } else if (components.length == 1) {
            rgb = new float[] {components[0], components[0], components[0]};
        } else if (components.length == 4) {
            // CMYK to RGB, good enough for button chrome.
            float k = components[3];
            rgb =
                    new float[] {
                        (1 - components[0]) * (1 - k),
                        (1 - components[1]) * (1 - k),
                        (1 - components[2]) * (1 - k)
                    };
        }
        // PDPageContentStream rejects anything outside 0..1, and a throw here loses the appearance.
        for (int i = 0; i < rgb.length; i++) {
            rgb[i] = Math.min(1f, Math.max(0f, rgb[i]));
        }
        return rgb;
    }

    /** A circle from four Bezier arcs; PDF has no primitive for one. */
    private void drawCircle(PDPageContentStream content, float cx, float cy, float r)
            throws IOException {
        if (r <= 0) {
            return;
        }
        float k = r * 0.5523f;
        content.moveTo(cx - r, cy);
        content.curveTo(cx - r, cy + k, cx - k, cy + r, cx, cy + r);
        content.curveTo(cx + k, cy + r, cx + r, cy + k, cx + r, cy);
        content.curveTo(cx + r, cy - k, cx + k, cy - r, cx, cy - r);
        content.curveTo(cx - k, cy - r, cx - r, cy - k, cx - r, cy);
        content.closePath();
    }

    /**
     * One widget per option stacked below {@code baseRect}, each keyed by its sanitized export
     * value so the group behaves as a single selectable field.
     */
    /**
     * Per-option widget rects laid out INSIDE the drawn box, which is the group's total extent.
     * Stacking outside it made a three-option group three times taller than what was drawn.
     */
    public static List<PDRectangle> radioOptionRects(
            PDRectangle box, int count, Float gapOverride, Float sizeOverride) {
        List<PDRectangle> rects = new ArrayList<>();
        int n = Math.max(1, count);
        float h = box.getHeight();
        float slot = h / n;

        float size;
        if (sizeOverride != null && sizeOverride > 0f) {
            size = sizeOverride;
        } else if (gapOverride != null && gapOverride >= 0f) {
            size = (h - (n - 1) * gapOverride) / n;
        } else {
            // A quarter of each slot is breathing room, so the stack fills the drawn height.
            size = slot * 0.75f;
        }
        // Square keeps the circle round; a wide box becomes a left-aligned column.
        size = Math.max(1f, Math.min(size, box.getWidth()));

        float gap;
        if (gapOverride != null && gapOverride >= 0f) {
            gap = gapOverride;
        } else {
            gap = n > 1 ? Math.max(0f, (h - n * size) / (n - 1)) : 0f;
        }

        float top = box.getLowerLeftY() + h;
        for (int i = 0; i < n; i++) {
            float y = top - (i + 1) * size - i * gap;
            rects.add(new PDRectangle(box.getLowerLeftX(), y, size, size));
        }
        return rects;
    }

    private void createRadioField(
            PDAcroForm acroForm,
            PDPage page,
            PDRectangle baseRect,
            String name,
            NewFormFieldDefinition definition,
            List<String> options)
            throws IOException {

        List<String> values = (options == null || options.isEmpty()) ? List.of("1", "2") : options;

        PDRadioButton radio = new PDRadioButton(acroForm);
        radio.setPartialName(name);
        if (definition.label() != null && !definition.label().isBlank()) {
            try {
                radio.setAlternateFieldName(definition.label());
            } catch (Exception ignore) {
                // alternate name is best-effort
            }
        }
        radio.setRequired(Boolean.TRUE.equals(definition.required()));
        if (Boolean.TRUE.equals(definition.readOnly())) {
            radio.setReadOnly(true);
        }

        List<PDRectangle> optionRects =
                radioOptionRects(
                        baseRect, values.size(), definition.optionGap(), definition.optionSize());

        List<PDAnnotationWidget> widgets = new ArrayList<>();
        List<String> exportValues = new ArrayList<>();
        Set<String> usedStates = new HashSet<>();
        for (int i = 0; i < values.size(); i++) {
            String onState = sanitizeOnState(values.get(i), i, usedStates);
            exportValues.add(onState);

            PDRectangle rect = optionRects.get(i);

            PDAnnotationWidget widget = new PDAnnotationWidget();
            widget.setRectangle(rect);
            widget.setPage(page);
            widget.getCOSObject().setItem(COSName.P, page.getCOSObject());
            widget.getCOSObject().setItem(COSName.TYPE, COSName.getPDFName("Annot"));
            widget.getCOSObject().setItem(COSName.SUBTYPE, COSName.getPDFName("Widget"));
            widget.setParent(radio);
            // The widget's appearance state is "Off" until the group value selects it.
            widget.getCOSObject().setName(COSName.AS, OFF_STATE);
            widgets.add(widget);

            List<PDAnnotation> annotations = page.getAnnotations();
            if (annotations == null) {
                annotations = new ArrayList<>();
                page.setAnnotations(annotations);
            }
            annotations.add(widget);
        }

        radio.setWidgets(widgets);
        try {
            radio.setExportValues(exportValues);
        } catch (Exception e) {
            log.debug("Unable to set radio export values for '{}': {}", name, e.getMessage());
        }

        String defaultValue = definition.defaultValue();
        if (defaultValue != null
                && !defaultValue.isBlank()
                && exportValues.contains(defaultValue)) {
            try {
                radio.setValue(defaultValue);
            } catch (Exception e) {
                log.debug("Unable to set radio default '{}': {}", defaultValue, e.getMessage());
            }
        }

        acroForm.getFields().add(radio);
    }

    /** Builds a unique, PDF-name-safe "on" state for a radio widget. */
    private String sanitizeOnState(String raw, int index, Set<String> used) {
        String base =
                Optional.ofNullable(raw)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(FormUtils::sanitizePdfName)
                        .orElse("Option" + (index + 1));
        if (OFF_STATE.equalsIgnoreCase(base)) {
            base = "Option" + (index + 1);
        }
        String candidate = base;
        int suffix = 1;
        while (!used.add(candidate)) {
            candidate = base + "_" + suffix++;
        }
        return candidate;
    }

    /** Reduces a label to characters that are safe inside a PDF name. */
    private static String sanitizePdfName(String raw) {
        return raw == null ? "" : raw.trim().replaceAll("[^A-Za-z0-9_-]", "_");
    }

    /** Modify, then delete, then add, so generated names dedupe against the surviving set. */
    public void applyFieldEdits(
            PDDocument document,
            List<NewFormFieldDefinition> adds,
            List<ModifyFormFieldDefinition> modifies,
            List<String> deletes)
            throws IOException {
        applyFieldEdits(document, adds, modifies, deletes, null);
    }

    /**
     * As above, but records every operation that could not be applied into {@code skipped} so the
     * caller can report "3 of 4" instead of a bare success.
     */
    public void applyFieldEdits(
            PDDocument document,
            List<NewFormFieldDefinition> adds,
            List<ModifyFormFieldDefinition> modifies,
            List<String> deletes,
            List<SkippedFieldEdit> skipped)
            throws IOException {
        if (document == null) return;
        if (modifies != null && !modifies.isEmpty()) {
            modifyFormFields(document, modifies, skipped);
        }
        if (deletes != null && !deletes.isEmpty()) {
            deleteFormFields(document, deletes, skipped);
        }
        if (adds != null && !adds.isEmpty()) {
            addNewFields(document, adds, skipped);
        }
    }

    /** Adds an entry to a skip list that may be absent, so call sites stay one-liners. */
    private void recordSkip(
            List<SkippedFieldEdit> skipped, String operation, String target, String reason) {
        if (skipped != null) {
            skipped.add(new SkippedFieldEdit(operation, target, reason));
        }
    }

    public void deleteFormFields(PDDocument document, List<String> fieldNames) {
        deleteFormFields(document, fieldNames, null);
    }

    public void deleteFormFields(
            PDDocument document, List<String> fieldNames, List<SkippedFieldEdit> skipped) {
        if (document == null || fieldNames == null || fieldNames.isEmpty()) return;

        PDAcroForm acroForm = getAcroFormSafely(document);
        if (acroForm == null) {
            log.warn("Cannot delete fields because the document has no AcroForm");
            for (String name : fieldNames) {
                recordSkip(skipped, "delete", name, "the document has no form to delete from");
            }
            return;
        }

        for (String name : fieldNames) {
            if (name == null || name.isBlank()) {
                continue;
            }

            PDField field = locateField(acroForm, name.trim());
            if (field == null) {
                log.warn("No matching field '{}' found for deletion", name);
                recordSkip(skipped, "delete", name, "no field with that name exists");
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
                    PDPage page = resolveWidgetPage(document, widget, null);
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

    private PDPage resolveWidgetPage(
            PDDocument document,
            PDAnnotationWidget widget,
            Map<COSDictionary, Integer> annotationPageMap) {
        if (widget == null) {
            return null;
        }
        PDPage page = widget.getPage();
        if (page != null) {
            return page;
        }
        int pageIndex = determineWidgetPageIndex(document, widget, annotationPageMap);
        if (pageIndex >= 0) {
            try {
                return document.getPage(pageIndex);
            } catch (Exception e) {
                log.debug("Failed to resolve widget page index {}: {}", pageIndex, e.getMessage());
            }
        }
        return null;
    }

    private int determineWidgetPageIndex(
            PDDocument document,
            PDAnnotationWidget widget,
            Map<COSDictionary, Integer> annotationPageMap) {
        if (document == null || widget == null) {
            return -1;
        }

        if (annotationPageMap != null) {
            Integer idx = annotationPageMap.get(widget.getCOSObject());
            if (idx != null) {
                return idx;
            }
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

    /**
     * Build a map of annotation COS dictionaries to their respective page index. Scan once
     * per-document to avoid O(N^2) lookups during field extraction.
     */
    public Map<COSDictionary, Integer> buildAnnotationPageMap(PDDocument document) {
        if (document == null) {
            return Collections.emptyMap();
        }

        Map<COSDictionary, Integer> map = new HashMap<>();
        int pageCount = document.getNumberOfPages();
        for (int i = 0; i < pageCount; i++) {
            try {
                PDPage page = document.getPage(i);
                List<PDAnnotation> annotations = page.getAnnotations();
                for (PDAnnotation annot : annotations) {
                    if (annot != null) {
                        map.putIfAbsent(annot.getCOSObject(), i);
                    }
                }
            } catch (Exception e) {
                log.debug("Failed to index annotations for page {}: {}", i, e.getMessage());
            }
        }
        return map;
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
        // Group (non-terminal) names occupy the namespace too, so a new field must not be
        // allowed to take one; omitting them hides a whole class of collision.
        for (PDField field : acroForm.getFieldTree()) {
            String fqn = field.getFullyQualifiedName();
            if (fqn != null && !fqn.isEmpty()) {
                existing.add(fqn);
            }
        }
        return existing;
    }

    /** A text field's /MaxLen, or null when unset so the editor shows an empty box. */
    private Integer extractMaxLength(PDField field) {
        if (field instanceof PDTextField textField) {
            int maxLen = textField.getMaxLen();
            return maxLen > 0 ? maxLen : null;
        }
        return null;
    }

    /** Reads a push button's action back into the same spec string the editor sends. */
    private String extractButtonAction(PDField field) {
        if (!(field instanceof PDPushButton)) {
            return null;
        }
        for (PDAnnotationWidget widget : field.getWidgets()) {
            COSBase raw = widget.getCOSObject().getDictionaryObject(COSName.A);
            if (!(raw instanceof COSDictionary action)) {
                continue;
            }
            String subtype = action.getNameAsString(COSName.S);
            if ("ResetForm".equals(subtype)) {
                return "reset";
            }
            if ("Named".equals(subtype)) {
                return "Print".equalsIgnoreCase(action.getNameAsString(COSName.N)) ? "print" : null;
            }
            if ("URI".equals(subtype)) {
                return "uri:" + Optional.ofNullable(action.getString(COSName.URI)).orElse("");
            }
            if ("SubmitForm".equals(subtype)) {
                return "submit:" + Optional.ofNullable(action.getString(COSName.F)).orElse("");
            }
        }
        return null;
    }

    /** The parent prefix of a qualified name, including the trailing dot, or "" if top level. */
    private String parentPrefix(String qualifiedName) {
        int dot = qualifiedName == null ? -1 : qualifiedName.lastIndexOf('.');
        return dot < 0 ? "" : qualifiedName.substring(0, dot + 1);
    }

    /**
     * The partial name a rename should set. Only a new name under the target's own parent may be
     * qualified; anything else is used verbatim so it cannot silently re-parent the field.
     */
    private String leafName(String targetName, String newName) {
        String prefix = parentPrefix(targetName);
        return !prefix.isEmpty() && newName.startsWith(prefix)
                ? newName.substring(prefix.length())
                : newName;
    }

    /**
     * Why the rename is impossible, or null. An unchanged name is not a rename, so a field nested
     * under a parent is not rejected for the period in its qualified name.
     */
    public String renameProblem(String targetName, String newName) {
        if (newName == null || newName.equals(targetName)) {
            return null;
        }
        // A nested field's box shows "Parent.Child", so renaming the leaf under the same
        // parent is legitimate; only the leaf has to be a storable partial name.
        String trimmed = newName.trim();
        String leaf = leafName(targetName, trimmed);
        if (!trimmed.isEmpty() && leaf.isBlank()) {
            return "Field name '" + newName + "' has no name after the parent prefix.";
        }
        return invalidFieldNameReason(leaf);
    }

    /**
     * Why {@code name} is unusable as a field name, or null when it is fine. AcroForm reserves the
     * period as the parent/child separator, so PDFBox rejects it outright in a partial name.
     */
    public String invalidFieldNameReason(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        if (name.chars().anyMatch(Character::isISOControl)) {
            // A line break in a name would also forge a second line in every log it reaches.
            return "Field name cannot contain line breaks or control characters.";
        }
        if (name.indexOf('.') >= 0) {
            return "Field name '"
                    + sanitizeForLog(name)
                    + "' cannot contain a period. PDF forms use '.' to separate a parent field"
                    + " from its children.";
        }
        return null;
    }

    /**
     * A caller-supplied string made safe to log. Without this a name containing CR/LF writes an
     * extra, attacker-chosen line into the log file (CWE-117).
     */
    public static String sanitizeForLog(String value) {
        if (value == null) {
            return null;
        }
        StringBuilder out = new StringBuilder(value.length());
        value.chars().forEach(c -> out.append(Character.isISOControl(c) ? ' ' : (char) c));
        return out.toString();
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
        return generateUniqueFieldName(baseName, existingNames, "");
    }

    /**
     * A partial name no sibling already uses. {@code qualifiedPrefix} is prepended only for the
     * collision check, because {@code existingNames} holds fully qualified names.
     */
    private String generateUniqueFieldName(
            String baseName, Set<String> existingNames, String qualifiedPrefix) {
        // Trimmed, not sanitized: callers must reject bad names first via invalidFieldNameReason.
        String trimmed =
                Optional.ofNullable(baseName)
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .orElse("field");

        String candidate = trimmed;
        int counter = 1;
        while (existingNames.contains(qualifiedPrefix + candidate)) {
            candidate = trimmed + "_" + counter;
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
        if (Boolean.TRUE.equals(definition.readOnly())) {
            field.setReadOnly(true);
        }

        // A terminal field with no /Kids shares its dictionary with one merged widget.
        // A separately built widget is not linked via /Kids, so its /Rect is lost on save.
        boolean reuseFieldDict;
        PDAnnotationWidget widget;
        if (existingWidget != null) {
            widget = existingWidget;
            reuseFieldDict = false;
        } else {
            List<PDAnnotationWidget> current = field.getWidgets();
            if (current != null && !current.isEmpty()) {
                widget = current.get(0);
            } else {
                widget = new PDAnnotationWidget();
            }
            reuseFieldDict = widget.getCOSObject() == field.getCOSObject();
            // Make sure the shared dictionary is recognised as a widget annotation.
            widget.getCOSObject().setItem(COSName.TYPE, COSName.getPDFName("Annot"));
            widget.getCOSObject().setItem(COSName.SUBTYPE, COSName.getPDFName("Widget"));
        }

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
        // Explicitly set the /P entry so the widget keeps a valid page reference
        // after save/reload (some viewers rely on it to resolve the widget page).
        widget.getCOSObject().setItem(COSName.P, page.getCOSObject());
        widget.setPrinted(true);

        if (definition.tooltip() != null && !definition.tooltip().isBlank()) {
            widget.getCOSObject().setString(COSName.TU, definition.tooltip());
        } else {
            try {
                widget.getCOSObject().removeItem(COSName.TU);
            } catch (Exception e) {
                log.debug("Unable to clear tooltip for '{}': {}", name, e.getMessage());
            }
        }

        // Only link a SEPARATE widget into the field; the merged widget IS the
        // field dictionary and is already its own widget. setWidgets is what persists
        // the /Kids link - getWidgets() alone returns a detached copy.
        if (!reuseFieldDict) {
            List<PDAnnotationWidget> widgets = new ArrayList<>(field.getWidgets());
            if (!widgets.contains(widget)) {
                widgets.add(widget);
                field.setWidgets(widgets);
            }
            widget.setParent(field);
        }

        List<PDAnnotation> annotations = page.getAnnotations();
        if (annotations == null) {
            // page.getAnnotations() can return null; calling it again and adding
            // would NPE. Initialise the list and attach it to the page first.
            annotations = new ArrayList<>();
            page.setAnnotations(annotations);
        }
        if (!annotations.contains(widget)) {
            annotations.add(widget);
        }
        acroForm.getFields().add(field);
    }

    /** Drops AcroForm fields whose widgets are no longer on any page of {@code document}. */
    public void pruneOrphanedFormFields(PDDocument document) {
        if (document == null) {
            return;
        }
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return;
        }
        PDAcroForm form = catalog.getAcroForm(null);
        if (form == null) {
            return;
        }
        List<PDField> fields = form.getFields();
        if (fields.isEmpty()) {
            return;
        }

        Set<COSDictionary> liveWidgets = collectLiveWidgetDictionaries(document);
        List<PDField> kept = pruneFieldList(fields, liveWidgets);
        if (kept.isEmpty()) {
            catalog.setAcroForm(null);
        } else if (kept.size() != fields.size()) {
            form.setFields(kept);
        }
    }

    private Set<COSDictionary> collectLiveWidgetDictionaries(PDDocument document) {
        Set<COSDictionary> live = new HashSet<>();
        int pageCount = document.getNumberOfPages();
        for (int i = 0; i < pageCount; i++) {
            try {
                for (PDAnnotation annotation : document.getPage(i).getAnnotations()) {
                    if (annotation instanceof PDAnnotationWidget) {
                        live.add(annotation.getCOSObject());
                    }
                }
            } catch (IOException e) {
                log.debug("Failed reading page {} annotations: {}", i, e.getMessage());
            }
        }
        return live;
    }

    private List<PDField> pruneFieldList(List<PDField> fields, Set<COSDictionary> liveWidgets) {
        List<PDField> kept = new ArrayList<>(fields.size());
        for (PDField field : fields) {
            if (field instanceof PDNonTerminalField nonTerminal) {
                List<PDField> children = nonTerminal.getChildren();
                List<PDField> remaining = pruneFieldList(children, liveWidgets);
                if (remaining.isEmpty()) {
                    continue;
                }
                if (remaining.size() != children.size()) {
                    nonTerminal.setChildren(remaining);
                }
                kept.add(nonTerminal);
            } else if (field instanceof PDTerminalField terminal) {
                List<PDAnnotationWidget> widgets = terminal.getWidgets();
                List<PDAnnotationWidget> liveOnes = new ArrayList<>(widgets.size());
                for (PDAnnotationWidget widget : widgets) {
                    if (liveWidgets.contains(widget.getCOSObject())) {
                        liveOnes.add(widget);
                    }
                }
                if (liveOnes.isEmpty()) {
                    continue;
                }
                if (liveOnes.size() != widgets.size()) {
                    terminal.setWidgets(liveOnes);
                }
                kept.add(terminal);
            } else {
                kept.add(field);
            }
        }
        return kept;
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
            String tooltip,
            Float fontSize,
            Boolean readOnly,
            Boolean multiline,
            Integer maxLength,
            String buttonAction,
            /** Gap between radio options in points; derived from the drawn box when null. */
            Float optionGap,
            /** Radio option size in points; derived from the drawn box when null. */
            Float optionSize) {

        /** The shape before option layout was tunable; both extras default to derived. */
        public NewFormFieldDefinition(
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
                String tooltip,
                Float fontSize,
                Boolean readOnly,
                Boolean multiline,
                Integer maxLength,
                String buttonAction) {
            this(
                    name,
                    label,
                    type,
                    pageIndex,
                    x,
                    y,
                    width,
                    height,
                    required,
                    multiSelect,
                    options,
                    defaultValue,
                    tooltip,
                    fontSize,
                    readOnly,
                    multiline,
                    maxLength,
                    buttonAction,
                    null,
                    null);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ModifyFormFieldDefinition(
            String targetName,
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
            String tooltip,
            Float fontSize,
            Boolean readOnly,
            Boolean multiline,
            Integer maxLength,
            String buttonAction,
            /** Gap between radio options in points; leaves the existing layout alone when null. */
            Float optionGap,
            /** Radio option size in points; leaves the existing layout alone when null. */
            Float optionSize) {

        /** The shape before option layout was tunable; both extras default to unchanged. */
        public ModifyFormFieldDefinition(
                String targetName,
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
                String tooltip,
                Float fontSize,
                Boolean readOnly,
                Boolean multiline,
                Integer maxLength,
                String buttonAction) {
            this(
                    targetName,
                    name,
                    label,
                    type,
                    pageIndex,
                    x,
                    y,
                    width,
                    height,
                    required,
                    multiSelect,
                    options,
                    defaultValue,
                    tooltip,
                    fontSize,
                    readOnly,
                    multiline,
                    maxLength,
                    buttonAction,
                    null,
                    null);
        }
    }

    /** A mixed batch of field edits applied in one request via {@link #applyFieldEdits}. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FieldEditBatch(
            List<NewFormFieldDefinition> add,
            List<ModifyFormFieldDefinition> modify,
            List<String> delete) {}

    /**
     * One requested edit the document could not take, so the caller can report "3 of 4" rather than
     * a bare success. {@code operation} is "add", "modify" or "delete".
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    /**
     * Turns a library failure into something a person can act on. Raw messages like "/DR is a
     * required entry" name PDF internals the user has never heard of.
     */
    public static String readableFailure(Throwable failure) {
        String raw = failure == null ? null : failure.getMessage();
        if (raw == null || raw.isBlank()) {
            return "this PDF would not accept the change";
        }
        String lower = raw.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("/dr") || lower.contains("default resources")) {
            return "this PDF's form has no font settings, so the field could not be styled";
        }
        if (lower.contains("font") && lower.contains("not")) {
            return "the font this field asks for is not embedded in the PDF";
        }
        if (lower.contains("encrypt") || lower.contains("password")) {
            return "the PDF is protected, so its form cannot be changed";
        }
        if (lower.contains("read-only") || lower.contains("readonly")) {
            return "the field is read-only in this PDF";
        }
        // Anything unrecognised stays vague rather than leaking internals at the user.
        log.debug("Unmapped form edit failure: {}", raw);
        return "this PDF would not accept the change";
    }

    /** Skip reasons travel in a response header, so an echoed value cannot be unbounded. */
    public static String abbreviate(String value, int max) {
        if (value == null || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "...";
    }

    public record SkippedFieldEdit(String operation, String target, String reason) {}

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

    /**
     * Comparator for sorting form fields by page, then vertically (top-to-bottom), then
     * horizontally (left-to-right) for fields on approximately the same line.
     */
    static final class FieldCoordinateComparator implements Comparator<FormFieldWithCoordinates> {

        private static int firstWidgetPageIndex(FormFieldWithCoordinates f) {
            return (f.getWidgets() != null
                            && !f.getWidgets().isEmpty()
                            && f.getWidgets().getFirst() != null)
                    ? f.getWidgets().getFirst().getPageIndex()
                    : -1;
        }

        private static float firstWidgetY(FormFieldWithCoordinates f) {
            return (f.getWidgets() != null
                            && !f.getWidgets().isEmpty()
                            && f.getWidgets().getFirst() != null)
                    ? f.getWidgets().getFirst().getY()
                    : 0;
        }

        private static float firstWidgetX(FormFieldWithCoordinates f) {
            return (f.getWidgets() != null
                            && !f.getWidgets().isEmpty()
                            && f.getWidgets().getFirst() != null)
                    ? f.getWidgets().getFirst().getX()
                    : 0;
        }

        @Override
        public int compare(FormFieldWithCoordinates a, FormFieldWithCoordinates b) {
            int pageA = firstWidgetPageIndex(a);
            int pageB = firstWidgetPageIndex(b);
            int pageCompare = Integer.compare(pageA, pageB);
            if (pageCompare != 0) return pageCompare;

            float yA = firstWidgetY(a);
            float yB = firstWidgetY(b);

            // Fields on approximately the same line should be sorted left-to-right
            if (Math.abs(yA - yB) < SAME_LINE_THRESHOLD_PT) {
                return Float.compare(firstWidgetX(a), firstWidgetX(b));
            }
            return Float.compare(yA, yB);
        }
    }
}
