package stirling.software.proprietary.policy.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How a {@link RoutingRule} compares a document fact against its values.
 *
 * <p>A fact is either a scalar or an array (the classifier writes {@code classification.labels} as
 * an array), so the operator reads "any of the fact's values is any of the rule's" - which
 * collapses to plain equality for a scalar.
 *
 * <p>One operator, because one is what a rule can be built with. The enum is the seam for adding
 * more: the wire already carries the discriminator, so a negation or a presence test costs a
 * constant and a branch in {@code RoutingRuleMatcher} rather than a format change.
 */
public enum MatchOperator {
    MATCHES_ANY("matches-any");

    private final String value;

    MatchOperator(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static MatchOperator fromValue(String value) {
        for (MatchOperator operator : values()) {
            if (operator.value.equals(value)) {
                return operator;
            }
        }
        throw new IllegalArgumentException("Unknown match operator: " + value);
    }
}
