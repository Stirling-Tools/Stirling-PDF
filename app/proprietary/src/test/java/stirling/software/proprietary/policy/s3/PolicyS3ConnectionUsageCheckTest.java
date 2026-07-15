package stirling.software.proprietary.policy.s3;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;

/** Tests for {@link PolicyS3ConnectionUsageCheck}'s reference scan across sources and outputs. */
class PolicyS3ConnectionUsageCheckTest {

    private final InProcessSourceStore sourceStore = new InProcessSourceStore();
    private final InProcessPolicyStore policyStore = new InProcessPolicyStore();
    private final PolicyS3ConnectionUsageCheck check =
            new PolicyS3ConnectionUsageCheck(sourceStore, policyStore);

    @Test
    void reportsSourcesAndOutputsReferencingTheConnection() {
        sourceStore.save(
                new Source(
                        null,
                        "Claims intake",
                        "s3",
                        Map.of("connectionId", 5L, "prefix", "in/"),
                        true,
                        "alice",
                        null));
        policyStore.save(
                new Policy(
                        null,
                        "Rotate",
                        "alice",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                        new OutputSpec("s3", Map.of("connectionId", "5")),
                        null));

        assertThat(check.usagesOf(5))
                .containsExactlyInAnyOrder("source 'Claims intake'", "pipeline 'Rotate'");
        assertThat(check.usagesOf(6)).isEmpty();
    }
}
