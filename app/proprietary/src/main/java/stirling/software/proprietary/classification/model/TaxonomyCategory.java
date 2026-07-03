package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * A structural family of documents, owning the doc_types shaped like it. {@code docTypes} is
 * serialized in the engine's camelCase shape (the engine's {@code ClassificationTaxonomy} model
 * aliases {@code doc_types} onto it), so a stored taxonomy passes straight through to the engine.
 * {@code icon} is an optional presentational key (shown in the file sidebar); the engine ignores
 * it.
 */
public record TaxonomyCategory(
        String id, String label, String icon, List<TaxonomyDocumentType> docTypes) {

    public TaxonomyCategory {
        docTypes = docTypes == null ? List.of() : List.copyOf(docTypes);
    }
}
