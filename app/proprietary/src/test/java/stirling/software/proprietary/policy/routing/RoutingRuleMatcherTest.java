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

    private final JsonMapper mapper = JsonMapper.builder().build();

    private JsonNode facts(String json) {
        return mapper.readTree(json);
    }

    private static RoutingRule rule(MatchOperator operator, String... values) {
        return new RoutingRule("classification.labels", operator, List.of(values), "dest");
    }

    @Test
    void matchesWhenTheVerdictCarriesOneOfTheRulesLabels() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"invoice\",\"receipt\"]}}");

        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.MATCHES_ANY, "invoice"), facts))
                .isTrue();
        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.MATCHES_ANY, "contract"), facts))
                .isFalse();
    }

    @Test
    void comparesLabelsIgnoringCaseAndSurroundingSpace() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"purchase-order\"]}}");

        assertThat(
                        RoutingRuleMatcher.matches(
                                rule(MatchOperator.MATCHES_ANY, " Purchase-Order "), facts))
                .isTrue();
    }

    @Test
    void readsAScalarFactAsASingleValue() {
        JsonNode facts = facts("{\"classification\":{\"label\":\"invoice\"}}");
        RoutingRule scalar =
                new RoutingRule(
                        "classification.label",
                        MatchOperator.MATCHES_ANY,
                        List.of("invoice"),
                        "dest");

        assertThat(RoutingRuleMatcher.matches(scalar, facts)).isTrue();
    }

    @Test
    void anUnclassifiedDocumentSatisfiesAbsentAndNeitherMatchingOperator() {
        JsonNode unclassified = facts("{\"document\":{\"filename\":\"a.pdf\"}}");

        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.ABSENT), unclassified)).isTrue();
        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.EXISTS), unclassified)).isFalse();
        assertThat(
                        RoutingRuleMatcher.matches(
                                rule(MatchOperator.MATCHES_ANY, "invoice"), unclassified))
                .isFalse();
        // The one that matters: a "not confidential" rule must NOT claim a document nobody
        // classified, or an unexamined document is delivered to the permissive destination.
        assertThat(
                        RoutingRuleMatcher.matches(
                                rule(MatchOperator.MATCHES_NONE, "confidential"), unclassified))
                .isFalse();
    }

    @Test
    void matchesNoneClaimsADocumentTheRulesLabelsDoNotDescribe() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[\"contract\"]}}");

        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.MATCHES_NONE, "invoice"), facts))
                .isTrue();
        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.MATCHES_NONE, "contract"), facts))
                .isFalse();
    }

    @Test
    void anEmptyLabelArrayCountsAsNoVerdictRatherThanAnEmptyOne() {
        JsonNode facts = facts("{\"classification\":{\"labels\":[]}}");

        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.ABSENT), facts)).isTrue();
        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.EXISTS), facts)).isFalse();
        assertThat(RoutingRuleMatcher.matches(rule(MatchOperator.MATCHES_NONE, "invoice"), facts))
                .isFalse();
    }

    @Test
    void aFieldWhosePathRunsThroughAMissingObjectSimplyHasNoValue() {
        JsonNode facts = facts("{\"document\":{\"filename\":\"a.pdf\"}}");
        RoutingRule deep =
                new RoutingRule(
                        "sensitivityLabel.name",
                        MatchOperator.MATCHES_ANY,
                        List.of("Secret"),
                        "dest");

        assertThat(RoutingRuleMatcher.matches(deep, facts)).isFalse();
    }
}
