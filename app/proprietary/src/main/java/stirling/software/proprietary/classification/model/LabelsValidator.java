package stirling.software.proprietary.classification.model;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Structural validation for a user- or admin-supplied label set, run before it is stored so a
 * malformed vocabulary can never reach the classifier. Mirrors the invariants the engine relies on:
 * non-blank ids and names, each unique within the set (ids exactly, names case-insensitively).
 */
public final class LabelsValidator {

    private LabelsValidator() {}

    // Generous upper bounds so a legitimate label set is never blocked, but a single team or user
    // can't store an unbounded blob that would bloat the row, balloon the classifier prompt, or
    // exhaust memory on deserialize.
    static final int MAX_LABELS = 500;
    static final int MAX_TEXT_LENGTH = 128;

    // Icon is a Material Symbols key (lowercase, digits, hyphens). Enforce the SHAPE server-side —
    // the exact allowlist lives in the frontend — so a client bypassing the UI can't store
    // arbitrary
    // text that would render as garbage (or worse) in every teammate's sidebar.
    private static final Pattern ICON_KEY = Pattern.compile("^[a-z0-9-]+$");

    /**
     * @throws IllegalArgumentException with a human-readable message when the label set is invalid.
     */
    public static void validate(ClassificationLabels labels) {
        if (labels == null || labels.labels() == null) {
            throw new IllegalArgumentException("Labels are required");
        }
        if (labels.labels().size() > MAX_LABELS) {
            throw new IllegalArgumentException("Too many labels (max " + MAX_LABELS + ")");
        }
        Set<String> ids = new HashSet<>();
        Set<String> names = new HashSet<>();
        for (ClassificationLabel label : labels.labels()) {
            requireText(label.id(), "Label id");
            requireText(label.name(), "Label name");
            if (label.icon() != null && !label.icon().isEmpty()) {
                if (label.icon().length() > MAX_TEXT_LENGTH) {
                    throw new IllegalArgumentException(
                            "Label icon is too long (max " + MAX_TEXT_LENGTH + " characters)");
                }
                if (!ICON_KEY.matcher(label.icon()).matches()) {
                    throw new IllegalArgumentException("Invalid label icon: " + label.icon());
                }
            }
            if (!ids.add(label.id().trim())) {
                throw new IllegalArgumentException("Duplicate label id: " + label.id());
            }
            if (!names.add(label.name().trim().toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("Duplicate label name: " + label.name());
            }
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (value.trim().length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException(
                    field + " is too long (max " + MAX_TEXT_LENGTH + " characters)");
        }
    }
}
