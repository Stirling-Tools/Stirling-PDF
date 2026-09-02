package stirling.software.proprietary.policy.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * How a {@link RoutingRule} compares a document fact against its values.
 *
 * <p>A fact is either a scalar or an array (the classifier writes {@code classification.labels} as
 * an array), so the matching operators read "any of the fact's values is any of the rule's" - which
 * collapses to plain equality for a scalar.
 */
public enum MatchOperator {
    MATCHES_ANY("matches-any"),
    MATCHES_NONE("matches-none"),
    /** The fact is present and non-empty; the rule's values are ignored. */
    EXISTS("exists"),
    /** The fact is missing or empty; the rule's values are ignored. */
    ABSENT("absent");

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

    /** Whether this operator reads the rule's values at all. */
    public boolean usesValues() {
        return this == MATCHES_ANY || this == MATCHES_NONE;
    }
}
