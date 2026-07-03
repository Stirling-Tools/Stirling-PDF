package stirling.software.proprietary.classification.model;

import java.util.HashSet;
import java.util.Set;

/**
 * Structural validation for an admin-supplied (or imported) taxonomy, run before it is stored so a
 * malformed vocabulary can never reach the classifier. Mirrors the invariants the engine relies on:
 * at least one category, non-blank ids/labels everywhere, ids unique among categories and among the
 * doc_types within a category, and non-blank unique tags.
 */
public final class TaxonomyValidator {

    private TaxonomyValidator() {}

    // Generous upper bounds so a legitimate taxonomy is never blocked, but a single team can't
    // store an unbounded blob that would bloat the row, balloon the classifier prompt, or exhaust
    // memory on deserialize.
    static final int MAX_CATEGORIES = 200;
    static final int MAX_DOC_TYPES_PER_CATEGORY = 200;
    static final int MAX_TAGS = 500;
    static final int MAX_TEXT_LENGTH = 128;

    /**
     * @throws IllegalArgumentException with a human-readable message when the taxonomy is invalid.
     */
    public static void validate(ClassificationTaxonomy taxonomy) {
        if (taxonomy == null) {
            throw new IllegalArgumentException("Taxonomy is required");
        }
        if (taxonomy.categories().isEmpty()) {
            throw new IllegalArgumentException("Taxonomy must have at least one category");
        }
        if (taxonomy.categories().size() > MAX_CATEGORIES) {
            throw new IllegalArgumentException("Too many categories (max " + MAX_CATEGORIES + ")");
        }
        if (taxonomy.tags().size() > MAX_TAGS) {
            throw new IllegalArgumentException("Too many tags (max " + MAX_TAGS + ")");
        }
        Set<String> categoryIds = new HashSet<>();
        for (TaxonomyCategory category : taxonomy.categories()) {
            requireText(category.id(), "Category id");
            requireText(category.label(), "Category label");
            if (category.icon() != null && category.icon().length() > MAX_TEXT_LENGTH) {
                throw new IllegalArgumentException(
                        "Category icon is too long (max " + MAX_TEXT_LENGTH + " characters)");
            }
            if (category.docTypes().size() > MAX_DOC_TYPES_PER_CATEGORY) {
                throw new IllegalArgumentException(
                        "Too many sub-categories in '"
                                + category.id()
                                + "' (max "
                                + MAX_DOC_TYPES_PER_CATEGORY
                                + ")");
            }
            if (!categoryIds.add(category.id())) {
                throw new IllegalArgumentException("Duplicate category id: " + category.id());
            }
            Set<String> docTypeIds = new HashSet<>();
            for (TaxonomyDocumentType docType : category.docTypes()) {
                requireText(docType.id(), "Doc type id");
                requireText(docType.label(), "Doc type label");
                if (!docTypeIds.add(docType.id())) {
                    throw new IllegalArgumentException(
                            "Duplicate doc type id '"
                                    + docType.id()
                                    + "' in category '"
                                    + category.id()
                                    + "'");
                }
            }
        }
        Set<String> tags = new HashSet<>();
        for (String tag : taxonomy.tags()) {
            requireText(tag, "Tag");
            if (!tags.add(tag)) {
                throw new IllegalArgumentException("Duplicate tag: " + tag);
            }
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        if (value.length() > MAX_TEXT_LENGTH) {
            throw new IllegalArgumentException(
                    field + " is too long (max " + MAX_TEXT_LENGTH + " characters)");
        }
    }
}
