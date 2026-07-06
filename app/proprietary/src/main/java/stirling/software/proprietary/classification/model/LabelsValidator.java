package stirling.software.proprietary.classification.model;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Structural validation for a user- or admin-supplied label set, run before it is stored so a
 * malformed vocabulary can never reach the classifier. Mirrors the invariants the engine relies on:
 * non-blank names, unique case-insensitively.
 */
public final class LabelsValidator {

    private LabelsValidator() {}

    // Generous upper bounds so a legitimate label set is never blocked, but a single team or user
    // can't store an unbounded blob that would bloat the row, balloon the classifier prompt, or
    // exhaust memory on deserialize.
    static final int MAX_LABELS = 500;
    static final int MAX_TEXT_LENGTH = 128;

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
        Set<String> names = new HashSet<>();
        for (ClassificationLabel label : labels.labels()) {
            requireText(label.name(), "Label name");
            if (label.icon() != null && label.icon().length() > MAX_TEXT_LENGTH) {
                throw new IllegalArgumentException(
                        "Label icon is too long (max " + MAX_TEXT_LENGTH + " characters)");
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
