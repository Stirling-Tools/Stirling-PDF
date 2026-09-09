package stirling.software.proprietary.policy.routing;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.MatchOperator;
import stirling.software.proprietary.policy.model.RoutingRule;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Tests for {@link RoutingRuleMatcher}: which rule claims a document, and which does not. */
class RoutingRuleMatcherTest {

    private static final String LABELS = "classification.labels";

    private final JsonMapper mapper = JsonMapper.builder().build();

    private JsonNode facts(String json) {
        return mapper.readTree(json);
    }

    private static RoutingRule rule(String field, String... values) {
        return new RoutingRule(field, MatchOperator.MATCHES_ANY, List.of(values), "dest");
    }

    @Test
    void matchesWhenTheVerdictCarriesOneOfTheRulesLabels() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"invoice\",\"receipt\"]}}");

        assertThat(RoutingRuleMatcher.matches(rule(LABELS, "invoice"), facts)).isTrue();
        assertThat(RoutingRuleMatcher.matches(rule(LABELS, "contract"), facts)).isFalse();
    }

    @Test
    void comparesLabelsIgnoringCaseAndSurroundingSpace() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"purchase-order\"]}}");

        assertThat(RoutingRuleMatcher.matches(rule(LABELS, " Purchase-Order "), facts)).isTrue();
    }

    @Test
    void readsAScalarFactAsASingleValue() {
        JsonNode facts = facts("{\"classification\":{\"label\":\"invoice\"}}");
        assertThat(RoutingRuleMatcher.matches(rule("classification.label", "invoice"), facts))
                .isTrue();
    }

    @Test
    void aDocumentNobodyClassifiedIsClaimedByNoRule() {
        JsonNode unclassified = facts("{\"document\":{\"filename\":\"a.pdf\"}}");

        assertThat(RoutingRuleMatcher.matches(rule(LABELS, "invoice"), unclassified)).isFalse();
    }

    @Test
    void anEmptyLabelArrayCountsAsNoVerdictRatherThanAnEmptyOne() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[]}}");

        assertThat(RoutingRuleMatcher.matches(rule(LABELS, "invoice"), facts)).isFalse();
    }

    @Test
    void aFieldWhosePathRunsThroughAMissingObjectSimplyHasNoValue() {
        JsonNode facts = facts("{\"document\":{\"filename\":\"a.pdf\"}}");
        assertThat(RoutingRuleMatcher.matches(rule("sensitivityLabel.name", "Secret"), facts))
                .isFalse();
    }
}
