package stirling.software.proprietary.classification.model;

import java.util.List;

/**
 * The vocabulary a document is classified against — team-scoped and admin-editable. Its shape
 * mirrors the engine's {@code ClassificationTaxonomy} contract (categories owning doc_types, plus
 * free-standing cross-cutting tags), so a stored taxonomy is passed to the engine verbatim as the
 * per-request override. When a team has no stored taxonomy the engine falls back to its built-in
 * default.
 */
public record ClassificationTaxonomy(List<TaxonomyCategory> categories, List<String> tags) {

    public ClassificationTaxonomy {
        categories = categories == null ? List.of() : List.copyOf(categories);
        tags = tags == null ? List.of() : List.copyOf(tags);
    }
}
