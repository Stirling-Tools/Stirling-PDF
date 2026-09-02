package stirling.software.proprietary.policy.routing;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    /** The classify tool, as a policy step. */
    public static final String CLASSIFY_ENDPOINT = "/api/v1/ai/tools/classify-and-label";

    private ClassificationStepPlanner() {}

    /**
     * The policy with classification guaranteed to have run before its rules are evaluated. A
     * policy that routes on nothing classification-related, or that already classifies somewhere in
     * its pipeline, is returned untouched - an existing step's position is the user's arrangement,
     * not ours to reorder.
     */
    public static Policy ensureClassificationFirst(Policy policy) {
        boolean routesOnClassification =
                policy.routingRules().stream().anyMatch(RoutingRule::needsClassification);
        if (!routesOnClassification || classifies(policy.steps())) {
            return policy;
        }
        List<PipelineStep> steps = new ArrayList<>();
        steps.add(new PipelineStep(CLASSIFY_ENDPOINT, Map.of()));
        steps.addAll(policy.steps());
        return policy.withSteps(steps);
    }

    private static boolean classifies(List<PipelineStep> steps) {
        return steps.stream().anyMatch(step -> CLASSIFY_ENDPOINT.equals(step.operation()));
    }
}
