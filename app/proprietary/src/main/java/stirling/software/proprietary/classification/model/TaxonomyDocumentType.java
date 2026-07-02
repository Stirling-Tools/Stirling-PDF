package stirling.software.proprietary.classification.model;

/**
 * A specific instrument within a category (e.g. {@code nda} under {@code contract}).
 * Category-scoped: the engine enforces that a doc_type can only apply to its owning category.
 */
public record TaxonomyDocumentType(String id, String label) {}
