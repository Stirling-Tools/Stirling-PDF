package stirling.software.proprietary.policy.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.document.conditions.Condition;
import stirling.software.proprietary.document.conditions.ConditionInput;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class RoutingRuleTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void upgradesLegacyRulesInsideAStoredPolicyAndWritesOnlyNestedConditions() {
        Policy policy =
                mapper.readValue(
                        """
                {
                  "id": "p1", "name": "Route", "enabled": true, "required": false,
                  "routingRules": [
                    {"field": "classification.labels", "operator": "matches-any",
                     "values": [" Invoice ", "receipt"], "outputId": "finance"},
                    {"field": "document.extension", "operator": "matches-any",
                     "values": ["docx"], "outputId": "office"}
                  ],
                  "outputIds": ["archive"]
                }
                """,
                        Policy.class);

        assertThat(policy.routingRules())
                .containsExactly(
                        new RoutingRule(
                                new Condition.MatchesAny(
                                        new ConditionInput.DocumentField("classification.labels"),
                                        List.of(" Invoice ", "receipt")),
                                "finance"),
                        new RoutingRule(
                                new Condition.MatchesAny(
                                        new ConditionInput.DocumentField("document.extension"),
                                        List.of("docx")),
                                "office"));
        assertThat(policy.outputIds()).containsExactly("archive");

        String saved = mapper.writeValueAsString(policy);
        JsonNode rule = mapper.readTree(saved).path("routingRules").get(0);
        assertThat(rule.has("field")).isFalse();
        assertThat(rule.has("operator")).isFalse();
        assertThat(rule.has("values")).isFalse();
        assertThat(rule.path("condition").path("operator").asString()).isEqualTo("matches-any");
        assertThat(rule.path("condition").path("input").path("source").asString())
                .isEqualTo("document");
        assertThat(mapper.readValue(saved, Policy.class)).isEqualTo(policy);
    }

    @Test
    void explicitConditionTakesPrecedenceOverLegacyFields() {
        RoutingRule rule =
                mapper.readValue(
                        """
                {
                  "condition": {"input": {"source": "document", "field": "document.extension"},
                                "operator": "matches-any", "values": ["pdf"]},
                  "field": "classification.labels", "operator": "matches-any",
                  "values": ["invoice"], "outputId": "archive"
                }
                """,
                        RoutingRule.class);

        assertThat(rule.condition())
                .isEqualTo(
                        new Condition.MatchesAny(
                                new ConditionInput.DocumentField("document.extension"),
                                List.of("pdf")));
    }

    @Test
    void rejectsUnknownLegacyOperatorsRatherThanChangingTheirMeaning() {
        assertThatThrownBy(
                        () ->
                                mapper.readValue(
                                        """
                {"field": "classification.labels", "operator": "not-equal",
                 "values": ["invoice"], "outputId": "archive"}
                """,
                                        RoutingRule.class))
                .hasMessageContaining("condition operator");
    }

    @Test
    void rejectsUnknownConditionOperatorsAndSources() {
        assertThatThrownBy(
                        () ->
                                mapper.readValue(
                                        """
                {"condition": {"input": {"source": "document", "field": "document.sizeBytes"},
                               "operator": "greater-than", "value": 100}, "outputId": "archive"}
                """,
                                        RoutingRule.class))
                .hasMessageContaining("greater-than");
        assertThatThrownBy(
                        () ->
                                mapper.readValue(
                                        """
                {"condition": {"input": {"source": "step", "stepId": "lookup", "output": "code"},
                               "operator": "matches-any", "values": ["REVIEW"]}, "outputId": "archive"}
                """,
                                        RoutingRule.class))
                .hasMessageContaining("step");
    }
}
