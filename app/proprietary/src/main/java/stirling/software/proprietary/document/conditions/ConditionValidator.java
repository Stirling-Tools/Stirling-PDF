package stirling.software.proprietary.document.conditions;

/** Validates comparisons without requiring a routing destination or a pipeline. */
public final class ConditionValidator {

    private ConditionValidator() {}

    /** Rejects incomplete inputs and operands before a condition can be saved or executed. */
    public static void validate(Condition condition) {
        if (condition == null) {
            throw new IllegalArgumentException("a condition is required");
        }
        if (condition.input() == null) {
            throw new IllegalArgumentException("a condition must name an input");
        }
        switch (condition.input()) {
            case ConditionInput.DocumentField(var field) -> {
                if (field == null || field.isBlank()) {
                    throw new IllegalArgumentException("a document condition must name a field");
                }
            }
        }
        switch (condition) {
            case Condition.MatchesAny(var input, var values) -> {
                if (values.stream().allMatch(String::isBlank)) {
                    throw new IllegalArgumentException(
                            "a matches-any condition has nothing to match against");
                }
            }
        }
    }
}
