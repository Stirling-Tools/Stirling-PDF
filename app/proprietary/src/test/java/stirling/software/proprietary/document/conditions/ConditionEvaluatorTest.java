package stirling.software.proprietary.document.conditions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Tests for {@link ConditionEvaluator}: which rule claims a document, and which does not. */
class ConditionEvaluatorTest {

    private static final String LABELS = "classification.labels";

    private final JsonMapper mapper = JsonMapper.builder().build();

    private JsonNode facts(String json) {
        return mapper.readTree(json);
    }

    private static Condition condition(String field, String... values) {
        return new Condition.MatchesAny(new ConditionInput.DocumentField(field), List.of(values));
    }

    @Test
    void comparesDocumentPropertiesWithoutClassificationOrADestination() {
        JsonNode document =
                facts(
                        """
                {"document": {"extension": "DOCX", "pageCount": 12}}
                """);

        assertThat(
                        ConditionEvaluator.matches(
                                condition("document.extension", "pdf", " docx "), document))
                .isTrue();
        assertThat(ConditionEvaluator.matches(condition("document.pageCount", "12"), document))
                .isTrue();
    }

    @Test
    void missingNullAndBlankValuesDoNotMatch() {
        for (String json : List.of("{}", "{\"x\":null}", "{\"x\":\" \"}", "{\"x\":[]}")) {
            assertThat(ConditionEvaluator.matches(condition("x", "invoice"), facts(json)))
                    .isFalse();
        }
    }

    @Test
    void rejectsIncompleteComparisonsInsteadOfTreatingThemAsNonMatches() {
        assertThatThrownBy(() -> ConditionEvaluator.matches(null, facts("{}")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(
                        () ->
                                ConditionValidator.validate(
                                        new Condition.MatchesAny(null, List.of("invoice"))))
                .hasMessageContaining("input");
        assertThatThrownBy(() -> ConditionValidator.validate(condition(" ", "invoice")))
                .hasMessageContaining("field");
        assertThatThrownBy(
                        () -> ConditionValidator.validate(condition("classification.labels", " ")))
                .hasMessageContaining("nothing to match");
    }

    @Test
    void matchesWhenTheVerdictCarriesOneOfTheRulesLabels() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"invoice\",\"receipt\"]}}");

        assertThat(ConditionEvaluator.matches(condition(LABELS, "invoice"), facts)).isTrue();
        assertThat(ConditionEvaluator.matches(condition(LABELS, "contract"), facts)).isFalse();
    }

    @Test
    void comparesLabelsIgnoringCaseAndSurroundingSpace() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"purchase-order\"]}}");

        assertThat(ConditionEvaluator.matches(condition(LABELS, " Purchase-Order "), facts))
                .isTrue();
    }

    @Test
    void readsAScalarFactAsASingleValue() {
        JsonNode facts = facts("{\"classification\":{\"label\":\"invoice\"}}");
        assertThat(ConditionEvaluator.matches(condition("classification.label", "invoice"), facts))
                .isTrue();
    }

    @Test
    void aDocumentNobodyClassifiedIsClaimedByNoRule() {
        JsonNode unclassified = facts("{\"document\":{\"filename\":\"a.pdf\"}}");

        assertThat(ConditionEvaluator.matches(condition(LABELS, "invoice"), unclassified))
                .isFalse();
    }

    @Test
    void anEmptyLabelArrayCountsAsNoVerdictRatherThanAnEmptyOne() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[]}}");

        assertThat(ConditionEvaluator.matches(condition(LABELS, "invoice"), facts)).isFalse();
    }

    @Test
    void aFieldWhosePathRunsThroughAMissingObjectSimplyHasNoValue() {
        JsonNode facts = facts("{\"document\":{\"filename\":\"a.pdf\"}}");
        assertThat(ConditionEvaluator.matches(condition("sensitivityLabel.name", "Secret"), facts))
                .isFalse();
    }
}
