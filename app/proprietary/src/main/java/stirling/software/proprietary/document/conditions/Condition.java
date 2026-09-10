package stirling.software.proprietary.document.conditions;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * A comparison independent of what its caller does on a match. Each operator owns its operand
 * types, so numeric comparisons can use numbers without changing string-membership conditions.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "operator")
@JsonSubTypes(@JsonSubTypes.Type(value = Condition.MatchesAny.class, name = "matches-any"))
public sealed interface Condition permits Condition.MatchesAny {

    ConditionInput input();

    /** Matches any scalar or array value, ignoring case and surrounding whitespace. */
    record MatchesAny(ConditionInput input, List<String> values) implements Condition {
        public MatchesAny {
            values = values == null ? List.of() : List.copyOf(values);
        }
    }
}
