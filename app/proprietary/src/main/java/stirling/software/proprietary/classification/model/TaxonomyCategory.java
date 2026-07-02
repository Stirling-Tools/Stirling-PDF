package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * A structural family of documents, owning the doc_types shaped like it. {@code docTypes} is
 * serialized in the engine's camelCase shape (the engine's {@code ClassificationTaxonomy} model
 * aliases {@code doc_types} onto it), so a stored taxonomy passes straight through to the engine.
 */
public record TaxonomyCategory(String id, String label, List<TaxonomyDocumentType> docTypes) {

    public TaxonomyCategory {
        docTypes = docTypes == null ? List.of() : List.copyOf(docTypes);
    }
}
