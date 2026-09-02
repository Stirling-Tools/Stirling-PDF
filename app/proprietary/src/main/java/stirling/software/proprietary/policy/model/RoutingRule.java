package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * One routing decision: when {@code field} satisfies {@code operator} against {@code values}, the
 * document is delivered to the {@code Source} referenced by {@code outputId}.
 *
 * <p>Rules are evaluated in order and the first match wins, so a policy reads top-to-bottom like
 * the mail rules it stands in for. A document matching no rule falls back to the policy's {@code
 * outputIds}, and a policy with neither keeps its inline output.
 *
 * <p>{@code field} is a dotted path into the facts the engine already knows about a document - the
 * same namespace the external-API step exposes as placeholders - so {@code classification.labels}
 * routes on the classifier's verdict with no new plumbing. See {@code DocumentFacts}.
 */
public record RoutingRule(
        String field, MatchOperator operator, List<String> values, String outputId) {

    /** The fact namespace holding the classifier's verdict. */
    public static final String CLASSIFICATION_PREFIX = "classification.";

    public RoutingRule {
        values = values == null ? List.of() : List.copyOf(values);
    }

    /**
     * Whether this rule reads the classifier's verdict, and so needs classification to have run.
     */
    public boolean needsClassification() {
        return field != null && field.startsWith(CLASSIFICATION_PREFIX);
    }
}
