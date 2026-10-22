package stirling.software.proprietary.policy.routing;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import stirling.software.proprietary.classification.ClassificationConditions;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.RoutingRule;

/**
 * Guarantees that a policy routing on the classifier's verdict actually has one to route on.
 *
 * <p>Routing rules read facts off the document, and the classification facts are only there because
 * a classify step wrote them. That holds for a document uploaded through the editor, where the
 * seeded Classification policy runs first - but not for one pulled from a folder, bucket or
 * webhook, which no classification policy watches. Rather than leave that as an ordering the user
 * has to know about, a policy that routes on classification gets the classify step prepended to its
 * own pipeline at save time, so the ordering is a property of the policy rather than of the
 * deployment.
 *
 * <p>The step is added to the saved policy, not slipped in at run time: it shows in the pipeline
 * the user sees, and a run's history shows it ran.
 *
 * <p>It classifies unconditionally, and deliberately does not trust a verdict already on the
 * document. The classification key is ordinary PDF metadata that whoever supplied the document can
 * write, and the documents a routing policy reads come from a folder, bucket or webhook - that is,
 * from outside the team. Honouring an inbound verdict would let the submitter pick their own
 * destination, so the step overwrites it with a server-produced one.
 */
public final class ClassificationStepPlanner {

    public static final String CLASSIFY_ENDPOINT = "/api/v1/ai/tools/classify-and-label";

    /**
     * Forces a fresh server-side verdict. Without it the tool passes a document through whenever
     * one is already on it, and that field is metadata the submitter can write, so a routing
     * decision would be theirs to make.
     */
    static final Map<String, Object> RECLASSIFY = Map.of("reclassify", true);

    private ClassificationStepPlanner() {}

    /**
     * The policy with classification guaranteed to have run before its rules are evaluated. A
     * policy that routes on nothing classification-related is returned untouched; one that already
     * classifies somewhere in its pipeline keeps that step where the user put it, with {@link
     * #RECLASSIFY} forced on it so the verdict the rules read is still a server-produced one.
     */
    public static Policy ensureClassificationFirst(Policy policy) {
        boolean routesOnClassification =
                policy.routingRules().stream()
                        .map(RoutingRule::condition)
                        .anyMatch(ClassificationConditions::requiresClassification);
        if (!routesOnClassification) {
            return policy;
        }
        if (classifies(policy.steps())) {
            return forceReclassification(policy);
        }
        List<PipelineStep> steps = new ArrayList<>();
        steps.add(new PipelineStep(CLASSIFY_ENDPOINT, RECLASSIFY));
        steps.addAll(policy.steps());
        return policy.withSteps(steps);
    }

    private static Policy forceReclassification(Policy policy) {
        List<PipelineStep> steps = new ArrayList<>();
        boolean rewritten = false;
        for (PipelineStep step : policy.steps()) {
            if (!CLASSIFY_ENDPOINT.equals(step.operation()) || reclassifies(step)) {
                steps.add(step);
                continue;
            }
            Map<String, Object> parameters = new LinkedHashMap<>(step.parameters());
            parameters.putAll(RECLASSIFY);
            steps.add(new PipelineStep(step.operation(), parameters, step.fileParameters()));
            rewritten = true;
        }
        return rewritten ? policy.withSteps(steps) : policy;
    }

    private static boolean reclassifies(PipelineStep step) {
        Object value = step.parameters().get("reclassify");
        return value != null && Boolean.parseBoolean(String.valueOf(value));
    }

    private static boolean classifies(List<PipelineStep> steps) {
        return steps.stream().anyMatch(step -> CLASSIFY_ENDPOINT.equals(step.operation()));
    }
}
