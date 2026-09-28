package stirling.software.proprietary.document.conditions;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;

/** Evaluates document conditions without choosing actions or destinations. */
public final class ConditionEvaluator {

    private ConditionEvaluator() {}

    /**
     * Missing facts never match. Scalar/array values use case-insensitive, trimmed string matching.
     * Invalid conditions throw rather than silently returning a non-match.
     */
    public static boolean matches(Condition condition, JsonNode documentFacts) {
        ConditionValidator.validate(condition);
        JsonNode value =
                switch (condition.input()) {
                    case ConditionInput.DocumentField(var field) -> nodeAt(documentFacts, field);
                };
        return switch (condition) {
            case Condition.MatchesAny(var input, var values) -> intersects(valuesOf(value), values);
        };
    }

    private static boolean intersects(List<String> actual, List<String> wanted) {
        return wanted.stream().map(ConditionEvaluator::normalise).anyMatch(actual::contains);
    }

    /**
     * The resolved values, normalised for comparison. A missing, null, or blank fact has no values,
     * so no rule claims it.
     */
    private static List<String> valuesOf(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node == null || node.isNull() || node.isMissingNode()) {
            return values;
        }
        if (node.isArray()) {
            node.forEach(element -> addNormalised(values, element.asString()));
        } else {
            addNormalised(values, node.asString());
        }
        return values;
    }

    private static void addNormalised(List<String> into, String value) {
        if (value != null && !value.isBlank()) {
            into.add(normalise(value));
        }
    }

    private static String normalise(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static JsonNode nodeAt(JsonNode facts, String field) {
        if (facts == null || field == null || field.isBlank()) {
            return null;
        }
        JsonNode current = facts;
        for (String segment : field.split(Pattern.quote("."))) {
            if (current == null || !current.isObject()) {
                return null;
            }
            current = current.get(segment);
        }
        return current;
    }
}
