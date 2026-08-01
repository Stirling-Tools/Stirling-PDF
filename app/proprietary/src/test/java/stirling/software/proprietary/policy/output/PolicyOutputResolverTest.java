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
 * Tests for {@link PolicyOutputResolver}: a policy's {@code outputIds} resolve live to the stored
 * sources used as destinations (one spec each), an unreferenced policy keeps its inline output, and
 * a dangling reference falls back to inline delivery rather than failing the run.
 */
class PolicyOutputResolverTest {

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyOutputResolver resolver = new PolicyOutputResolver(sourceStore);

    @Test
    void resolvesEachOutputIdToItsStoredSource() {
        Source archive = sourceStore.save(folder("Archive", "/out"));
        Source backup = sourceStore.save(folder("Backup", "/backup"));

        List<OutputSpec> specs =
                resolver.resolve(policy().withOutputIds(List.of(archive.id(), backup.id())));

        assertEquals(2, specs.size());
        assertEquals("/out", specs.get(0).options().get("directory"));
        assertEquals("/backup", specs.get(1).options().get("directory"));
    }

    @Test
    void anUnreferencedPolicyKeepsItsInlineOutput() {
        List<OutputSpec> specs = resolver.resolve(policy());

        assertEquals(1, specs.size());
        assertEquals("inline", specs.get(0).type());
    }

    @Test
    void whenNoReferencesResolveItFallsBackToInline() {
        List<OutputSpec> specs =
                resolver.resolve(policy().withOutputIds(List.of("does-not-exist")));

        assertEquals(1, specs.size());
        assertEquals("inline", specs.get(0).type());
    }

    private static Source folder(String name, String directory) {
        return new Source(
                null, name, "folder", Map.of("directory", directory), true, "owner", null);
    }

    private static Policy policy() {
        return new Policy(
                "p1",
                "Pipeline",
                "owner",
                true,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}
