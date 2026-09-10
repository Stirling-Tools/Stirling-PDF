package stirling.software.proprietary.policy.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

import stirling.software.proprietary.document.conditions.Condition;
import stirling.software.proprietary.document.conditions.ConditionInput;

/**
 * Delivers a document satisfying {@code condition} to the source referenced by {@code outputId}.
 *
 * <p>Rules are evaluated in order and the first match wins, so a policy reads top-to-bottom like
 * the mail rules it stands in for. A document matching no rule falls back to the policy's {@code
 * outputIds}, and a policy with neither keeps its inline output.
 */
public record RoutingRule(Condition condition, String outputId) {

    /**
     * Reads both the nested condition and legacy flat rules from stored policies or API callers.
     * Serialization emits only the nested shape; an explicit condition takes precedence.
     */
    @JsonCreator
    public static RoutingRule fromJson(
            @JsonProperty("condition") Condition condition,
            @JsonProperty("outputId") String outputId,
            @JsonProperty("field") String field,
            @JsonProperty("operator") String operator,
            @JsonProperty("values") List<String> values) {
        if (condition != null) {
            return new RoutingRule(condition, outputId);
        }
        if (!"matches-any".equals(operator)) {
            throw new IllegalArgumentException(
                    "Unknown or missing condition operator: " + operator);
        }
        return new RoutingRule(
                new Condition.MatchesAny(new ConditionInput.DocumentField(field), values),
                outputId);
    }
}
