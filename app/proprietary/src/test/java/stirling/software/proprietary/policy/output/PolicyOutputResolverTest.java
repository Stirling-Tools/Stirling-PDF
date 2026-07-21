package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Tests for {@link PolicyOutputResolver}: a policy's {@code outputId} resolves live to the stored
 * source used as its destination, an unreferenced policy keeps its inline output, and a dangling
 * reference falls back to inline delivery rather than failing the run.
 */
class PolicyOutputResolverTest {

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyOutputResolver resolver = new PolicyOutputResolver(sourceStore);

    @Test
    void resolvesOutputIdToTheStoredSource() {
        Source archive =
                sourceStore.save(
                        new Source(
                                null,
                                "Archive",
                                "folder",
                                Map.of("directory", "/out"),
                                true,
                                "owner",
                                null));

        OutputSpec spec = resolver.resolve(policy().withOutputId(archive.id()));

        assertEquals("folder", spec.type());
        assertEquals("/out", spec.options().get("directory"));
    }

    @Test
    void anUnreferencedPolicyKeepsItsInlineOutput() {
        OutputSpec spec = resolver.resolve(policy());

        assertEquals("inline", spec.type());
    }

    @Test
    void aDanglingReferenceFallsBackToInline() {
        OutputSpec spec = resolver.resolve(policy().withOutputId("does-not-exist"));

        assertEquals("inline", spec.type());
    }

    private static Policy policy() {
        return new Policy(
                "p1",
                "Pipeline",
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}
