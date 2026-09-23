package stirling.software.SPDF.service.xfa;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDCheckBox;
import org.apache.pdfbox.pdmodel.interactive.form.PDChoice;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDPushButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDRadioButton;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTerminalField;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;

import stirling.software.SPDF.service.xfa.XfaSyncReport.Note;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Status;
import stirling.software.SPDF.service.xfa.XfaTemplate.Container;
import stirling.software.SPDF.service.xfa.XfaTemplate.Kind;

/**
 * Reads an AcroForm field as the value its XFA twin stores. Button state comes from the widgets'
 * {@code /AS}, which is what every viewer draws: PDFium writes {@code /V} as an {@code /Opt} index
 * for groups with export values, so {@code /V} alone does not name the state.
 */
final class XfaFieldValues {

    /**
     * @param text the value for the data node; null when {@code skipped} is set
     * @param skipped why the field is left out of the sync, or null when it takes part
     */
    record Value(String text, String kind, List<Note> notes, Status skipped) {

        static Value skip(String kind) {
            return new Value(null, kind, List.of(), Status.SKIPPED_TYPE);
        }

        boolean isSecret() {
            return "password".equals(kind) || "signature".equals(kind);
        }
    }

    private XfaFieldValues() {}

    /**
     * Every terminal field's state, keyed by fully qualified name, as {@link #stateOf} reads it.
     */
    static Map<String, String> snapshot(PDAcroForm acroForm) {
        Map<String, String> states = new LinkedHashMap<>();
        for (PDField field : acroForm.getFieldTree()) {
            if (field instanceof PDTerminalField terminal
                    && field.getFullyQualifiedName() != null) {
                states.putIfAbsent(field.getFullyQualifiedName(), stateOf(terminal));
            }
        }
        return states;
    }

    /** A comparable rendering of a field's state, used only to tell edited fields apart. */
    static String stateOf(PDTerminalField field) {
        if (field instanceof PDButton button && !(field instanceof PDPushButton)) {
            int selected = selectedWidget(button);
            return selected < 0
                    ? "Off"
                    : selected + ":" + onState(button.getWidgets().get(selected));
        }
        if (field instanceof PDChoice choice) {
            return String.join("\n", choice.getValue());
        }
        String value = field.getValueAsString();
        return value == null ? "" : value;
    }

    /**
     * @param container the template field or exclusion group behind {@code field}, or null when the
     *     template could not place it
     */
    static Value read(PDTerminalField field, Container container) {
        String ui = container == null ? null : container.ui;
        if (field instanceof PDSignatureField || "signature".equals(ui)) {
            return Value.skip("signature");
        }
        if (field instanceof PDPushButton || "button".equals(ui)) {
            return Value.skip("button");
        }
        if ("passwordEdit".equals(ui)) {
            return Value.skip("password");
        }
        if ("imageEdit".equals(ui)) {
            return Value.skip("image");
        }
        if ("barcode".equals(ui)) {
            return Value.skip("barcode");
        }
        List<Note> notes = new ArrayList<>();
        if (field instanceof PDButton button) {
            boolean group =
                    field instanceof PDRadioButton
                            || (container != null && container.kind == Kind.EXCL_GROUP);
            return group ? radio(button, container, notes) : checkbox(button, container, notes);
        }
        if (field instanceof PDChoice choice) {
            return choice(choice, container, notes);
        }
        if (field instanceof PDTextField text) {
            String kind =
                    container == null
                            ? "text"
                            : switch (container.ui == null ? "" : container.ui) {
                                case "numericEdit" -> "numeric";
                                case "dateTimeEdit" -> "date";
                                default -> container.richText ? "richText" : "text";
                            };
            return new Value(XfaXml.toXmlText(text.getValue()), kind, notes, null);
        }
        return Value.skip("unknown");
    }

    private static Value checkbox(PDButton button, Container container, List<Note> notes) {
        boolean checked = selectedWidget(button) >= 0;
        if (container != null && container.kind == Kind.FIELD) {
            return new Value(
                    checked ? container.onValue() : container.offValue(), "checkbox", notes, null);
        }
        notes.add(Note.FALLBACK);
        String on = firstOnState(button);
        String onValue = on == null ? "1" : on;
        String offValue = "1".equals(onValue) ? "0" : "";
        return new Value(checked ? onValue : offValue, "checkbox", notes, null);
    }

    /**
     * LiveCycle names the widgets of an exclusion group {@code /0 /1 /2...} in template order, so
     * state {@code n} means the n-th choice; any other naming is matched by value instead.
     */
    private static Value radio(PDButton button, Container container, List<Note> notes) {
        List<PDAnnotationWidget> widgets = button.getWidgets();
        int selected = selectedWidget(button);
        if (selected < 0) {
            return new Value("", "radio", notes, null);
        }
        List<String> states = new ArrayList<>(widgets.size());
        for (PDAnnotationWidget widget : widgets) {
            states.add(onState(widget));
        }
        List<String> exportValues = button.getExportValues();
        String exportValue = selected < exportValues.size() ? exportValues.get(selected) : null;
        String state = states.get(selected);
        if (container == null || container.kind != Kind.EXCL_GROUP) {
            notes.add(Note.FALLBACK);
            return new Value(exportValue != null ? exportValue : state, "radio", notes, null);
        }
        List<Container> choices = container.choices();
        if (isPositional(states) && state != null) {
            int position = Integer.parseInt(state);
            if (position < choices.size()) {
                String value = choices.get(position).onValue();
                notes.add(Note.POSITIONAL);
                if (exportValue != null && !exportValue.equals(value)) {
                    notes.add(Note.MISMATCH);
                }
                return new Value(value, "radio", notes, null);
            }
        }
        String candidate = exportValue != null ? exportValue : state;
        boolean known = choices.stream().anyMatch(choice -> choice.onValue().equals(candidate));
        if (!known) {
            notes.add(Note.MISMATCH);
        }
        return new Value(candidate == null ? "" : candidate, "radio", notes, null);
    }

    private static Value choice(PDChoice choice, Container container, List<Note> notes) {
        List<String> stored = new ArrayList<>();
        for (String selected : choice.getValue()) {
            stored.add(container == null ? selected : toSaveValue(container, selected));
        }
        if (stored.size() > 1) {
            notes.add(Note.APPROXIMATE);
        }
        return new Value(XfaXml.toXmlText(String.join("\n", stored)), "choice", notes, null);
    }

    /** A displayed item maps to its bound value when the template keeps the two apart. */
    private static String toSaveValue(Container container, String selected) {
        if (container.saveItems.isEmpty() || container.saveItems.contains(selected)) {
            return selected;
        }
        int index = container.items.indexOf(selected);
        return index >= 0 && index < container.saveItems.size()
                ? container.saveItems.get(index)
                : selected;
    }

    /** The index of the widget that is on, or -1 when none is. */
    static int selectedWidget(PDButton button) {
        List<PDAnnotationWidget> widgets = button.getWidgets();
        boolean sawState = false;
        for (int i = 0; i < widgets.size(); i++) {
            COSName state = widgets.get(i).getCOSObject().getCOSName(COSName.AS);
            if (state != null) {
                sawState = true;
                if (!COSName.Off.equals(state)) {
                    return i;
                }
            }
        }
        if (sawState) {
            return -1;
        }
        COSBase value = button.getCOSObject().getDictionaryObject(COSName.V);
        if (value instanceof COSName name && !COSName.Off.equals(name)) {
            for (int i = 0; i < widgets.size(); i++) {
                if (name.getName().equals(onState(widgets.get(i)))) {
                    return i;
                }
            }
            return widgets.size() == 1 ? 0 : -1;
        }
        return -1;
    }

    /** The first appearance state other than Off in the widget's normal appearance. */
    static String onState(PDAnnotationWidget widget) {
        COSDictionary appearance = widget.getCOSObject().getCOSDictionary(COSName.AP);
        COSDictionary normal = appearance == null ? null : appearance.getCOSDictionary(COSName.N);
        if (normal == null) {
            return null;
        }
        for (COSName key : normal.keySet()) {
            if (!COSName.Off.equals(key)) {
                return key.getName();
            }
        }
        return null;
    }

    private static String firstOnState(PDButton button) {
        for (PDAnnotationWidget widget : button.getWidgets()) {
            String state = onState(widget);
            if (state != null) {
                return state;
            }
        }
        return null;
    }

    private static boolean isPositional(List<String> states) {
        for (int i = 0; i < states.size(); i++) {
            if (!String.valueOf(i).equals(states.get(i))) {
                return false;
            }
        }
        return !states.isEmpty();
    }

    /** True for a checkbox, which {@link PDCheckBox} and a lone checkButton field both are. */
    static boolean isCheckbox(PDTerminalField field, Container container) {
        return field instanceof PDCheckBox
                || (field instanceof PDButton
                        && !(field instanceof PDRadioButton)
                        && (container == null || container.kind == Kind.FIELD));
    }
}
