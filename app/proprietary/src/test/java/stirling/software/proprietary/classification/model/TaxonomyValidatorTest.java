package stirling.software.proprietary.classification.model;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("TaxonomyValidator")
class TaxonomyValidatorTest {

    private static TaxonomyCategory category(String id, TaxonomyDocumentType... docTypes) {
        return new TaxonomyCategory(id, id + " label", null, List.of(docTypes));
    }

    private static TaxonomyDocumentType docType(String id) {
        return new TaxonomyDocumentType(id, id + " label");
    }

    @Test
    @DisplayName("accepts a well-formed taxonomy")
    void acceptsValid() {
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(category("invoice", docType("receipt")), category("contract")),
                        List.of("finance", "legal"));
        assertThatCode(() -> TaxonomyValidator.validate(taxonomy)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("rejects a taxonomy with no categories")
    void rejectsEmpty() {
        ClassificationTaxonomy taxonomy = new ClassificationTaxonomy(List.of(), List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least one category");
    }

    @Test
    @DisplayName("rejects duplicate category ids")
    void rejectsDuplicateCategory() {
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(category("invoice"), category("invoice")), List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate category id");
    }

    @Test
    @DisplayName("rejects duplicate doc type ids within a category")
    void rejectsDuplicateDocType() {
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(category("invoice", docType("receipt"), docType("receipt"))),
                        List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate doc type id");
    }

    @Test
    @DisplayName("rejects blank ids and labels")
    void rejectsBlank() {
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(new TaxonomyCategory(" ", "label", null, List.of())), List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be blank");
    }

    @Test
    @DisplayName("rejects duplicate tags")
    void rejectsDuplicateTags() {
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(category("invoice")), List.of("finance", "finance"));
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate tag");
    }

    @Test
    @DisplayName("rejects more categories than the cap")
    void rejectsTooManyCategories() {
        List<TaxonomyCategory> categories =
                java.util.stream.IntStream.rangeClosed(0, TaxonomyValidator.MAX_CATEGORIES)
                        .mapToObj(i -> category("cat" + i))
                        .toList();
        ClassificationTaxonomy taxonomy = new ClassificationTaxonomy(categories, List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Too many categories");
    }

    @Test
    @DisplayName("rejects an over-long label")
    void rejectsOverLongLabel() {
        String longLabel = "x".repeat(TaxonomyValidator.MAX_TEXT_LENGTH + 1);
        ClassificationTaxonomy taxonomy =
                new ClassificationTaxonomy(
                        List.of(new TaxonomyCategory("invoice", longLabel, null, List.of())),
                        List.of());
        assertThatThrownBy(() -> TaxonomyValidator.validate(taxonomy))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too long");
    }
}
