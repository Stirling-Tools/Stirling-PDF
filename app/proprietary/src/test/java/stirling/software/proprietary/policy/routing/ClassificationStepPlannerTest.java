package stirling.software.proprietary.policy.routing;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.MatchOperator;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.RoutingRule;

/** Tests for {@link ClassificationStepPlanner}: routing on a verdict guarantees there is one. */
class ClassificationStepPlannerTest {

    private static final String COMPRESS = "/api/v1/misc/compress-pdf";

    private static Policy policyWith(List<PipelineStep> steps, RoutingRule... rules) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(),
                steps,
                OutputSpec.inline(),
                List.of(),
                null,
                null,
                List.of(rules));
    }

    private static RoutingRule classificationRule() {
        return new RoutingRule(
                "classification.labels", MatchOperator.MATCHES_ANY, List.of("invoice"), "dest");
    }

    @Test
    void prependsClassifyWhenAPolicyRoutesOnTheVerdict() {
        Policy planned =
                ClassificationStepPlanner.ensureClassificationFirst(
                        policyWith(
                                List.of(new PipelineStep(COMPRESS, Map.of())),
                                classificationRule()));

        assertThat(planned.steps()).hasSize(2);
        assertThat(planned.steps().get(0).operation())
                .isEqualTo(ClassificationStepPlanner.CLASSIFY_ENDPOINT);
        // The classify tool passes a document through when it already carries a verdict, and that
        // verdict is attacker-writable metadata, so routing only gets a server-side one with this.
        assertThat(planned.steps().get(0).parameters()).containsEntry("reclassify", true);
        assertThat(planned.steps().get(1).operation()).isEqualTo(COMPRESS);
    }

    @Test
    void leavesAPolicyThatDoesNotRouteOnClassificationAlone() {
        RoutingRule bySize =
                new RoutingRule(
                        "document.pageCount", MatchOperator.MATCHES_ANY, List.of("1"), "dest");
        Policy original = policyWith(List.of(new PipelineStep(COMPRESS, Map.of())), bySize);

        assertThat(ClassificationStepPlanner.ensureClassificationFirst(original))
                .isSameAs(original);
    }

    @Test
    void leavesAPolicyWithNoRulesAlone() {
        Policy original = policyWith(List.of(new PipelineStep(COMPRESS, Map.of())));

        assertThat(ClassificationStepPlanner.ensureClassificationFirst(original))
                .isSameAs(original);
    }

    @Test
    void doesNotReorderAPipelineThatAlreadyClassifies() {
        Policy alreadyClassifies =
                policyWith(
                        List.of(
                                new PipelineStep(COMPRESS, Map.of()),
                                new PipelineStep(
                                        ClassificationStepPlanner.CLASSIFY_ENDPOINT, Map.of())),
                        classificationRule());

        Policy planned = ClassificationStepPlanner.ensureClassificationFirst(alreadyClassifies);

        assertThat(planned.steps().stream().map(PipelineStep::operation))
                .containsExactly(COMPRESS, ClassificationStepPlanner.CLASSIFY_ENDPOINT);
    }

    @Test
    void forcesReclassificationOnAClassifyStepTheUserPlaced() {
        Policy alreadyClassifies =
                policyWith(
                        List.of(
                                new PipelineStep(
                                        ClassificationStepPlanner.CLASSIFY_ENDPOINT,
                                        Map.of("reclassify", false)),
                                new PipelineStep(COMPRESS, Map.of())),
                        classificationRule());

        Policy planned = ClassificationStepPlanner.ensureClassificationFirst(alreadyClassifies);

        assertThat(planned.steps()).hasSize(2);
        assertThat(planned.steps().get(0).parameters()).containsEntry("reclassify", true);
    }

    @Test
    void leavesAClassifyStepThatAlreadyReclassifiesAlone() {
        Policy alreadyClassifies =
                policyWith(
                        List.of(
                                new PipelineStep(
                                        ClassificationStepPlanner.CLASSIFY_ENDPOINT,
                                        Map.of("reclassify", true))),
                        classificationRule());

        assertThat(ClassificationStepPlanner.ensureClassificationFirst(alreadyClassifies))
                .isSameAs(alreadyClassifies);
    }
}
