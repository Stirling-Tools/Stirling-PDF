package stirling.software.proprietary.policy.routing;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

import stirling.software.proprietary.policy.model.MatchOperator;
import stirling.software.proprietary.policy.model.RoutingRule;

import tools.jackson.databind.JsonNode;

/**
 * Decides which routing rule a document satisfies. Rules are tried in order and the first match
 * wins, so a policy reads top-to-bottom: the specific case above the general one.
 *
 * <p>A rule's {@code field} is a dotted path into the document facts, and the fact it names is
 * either a scalar or an array - the classifier writes {@code classification.labels} as an array of
 * label ids. Both are handled the same way: the rule matches when any of the fact's values is any
 * of the rule's, which for a scalar is plain equality. Comparison ignores case and surrounding
 * space, so a hand-typed rule value still matches a slug.
 */
public final class RoutingRuleMatcher {

    private static final String DOT = Pattern.quote(".");

    private RoutingRuleMatcher() {}

    /** The first rule the facts satisfy, or empty when none do. */
    public static Optional<RoutingRule> firstMatch(List<RoutingRule> rules, JsonNode facts) {
        return rules.stream().filter(rule -> matches(rule, facts)).findFirst();
    }

    public static boolean matches(RoutingRule rule, JsonNode facts) {
        if (rule == null || rule.operator() == null) {
            return false;
        }
        List<String> actual = valuesAt(facts, rule.field());
        return switch (rule.operator()) {
            case EXISTS -> !actual.isEmpty();
            case ABSENT -> actual.isEmpty();
            case MATCHES_ANY -> intersects(actual, rule.values());
            // Requires the fact to be PRESENT and not one of the values. A document that was
            // never examined - no verdict written, an unreadable PDF, a non-PDF - has no fact
            // to disagree with, and must not be claimed by "not confidential"; ABSENT is the
            // operator for that, and a document matching no rule falls back deliberately.
            case MATCHES_NONE -> !actual.isEmpty() && !intersects(actual, rule.values());
        };
    }

    private static boolean intersects(List<String> actual, List<String> wanted) {
        return wanted.stream().map(RoutingRuleMatcher::normalise).anyMatch(actual::contains);
    }

    /**
     * The values of the fact at a dotted path, normalised for comparison. A missing, null, or blank
     * fact has no values, which is what makes {@link MatchOperator#ABSENT} true for an unclassified
     * document.
     */
    private static List<String> valuesAt(JsonNode facts, String field) {
        JsonNode node = nodeAt(facts, field);
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

    /** Rule values are normalised the same way, so the two sides are comparable. */
    public static String normalise(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static JsonNode nodeAt(JsonNode facts, String field) {
        if (facts == null || field == null || field.isBlank()) {
            return null;
        }
        JsonNode current = facts;
        for (String segment : field.split(DOT)) {
            if (current == null || !current.isObject()) {
                return null;
            }
            current = current.get(segment);
        }
        return current;
    }
}
