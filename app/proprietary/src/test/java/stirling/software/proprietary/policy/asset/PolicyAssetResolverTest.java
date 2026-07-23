package stirling.software.proprietary.policy.asset;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Tests for {@link PolicyAssetResolver}: stored assets referenced by a policy's steps load into the
 * run's supporting files, keyed by the step's binding value, team-checked, with run-supplied assets
 * taking precedence.
 */
class PolicyAssetResolverTest {

    private final InProcessPolicyAssetStore store = new InProcessPolicyAssetStore();
    private final PolicyAssetResolver resolver = new PolicyAssetResolver(store);

    @Test
    void loadsReferencedAssetsUnderTheStepBindingKey() throws IOException {
        PolicyAsset image = save("logo.png", 7L, new byte[] {1, 2});
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of(),
                                Map.of("watermarkImage", image.id())));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        List<Resource> bound = resolved.supportingFiles().get(image.id());
        assertEquals(1, bound.size());
        assertEquals("logo.png", bound.get(0).getFilename());
        assertArrayEquals(new byte[] {1, 2}, bound.get(0).getContentAsByteArray());
    }

    @Test
    void aCommaSeparatedBindingLoadsEveryAssetUnderTheFullKey() {
        PolicyAsset first = save("a.pdf", null, new byte[] {1});
        PolicyAsset second = save("b.pdf", null, new byte[] {2});
        String key = first.id() + "," + second.id();
        Policy policy =
                policy(
                        null,
                        new PipelineStep(
                                "/api/v1/general/overlay-pdfs",
                                Map.of(),
                                Map.of("overlayFiles", key)));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        assertEquals(2, resolved.supportingFiles().get(key).size());
    }

    @Test
    void runSuppliedAssetsWinOverStoredOnes() {
        PolicyAsset stored = save("stored.png", null, new byte[] {9});
        Policy policy =
                policy(
                        null,
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of(),
                                Map.of("watermarkImage", stored.id())));
        Resource supplied = new ByteArrayResource(new byte[] {5});
        PolicyInputs inputs = new PolicyInputs(List.of(), Map.of(stored.id(), List.of(supplied)));

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        assertSame(inputs, resolved);
        assertSame(supplied, resolved.supportingFiles().get(stored.id()).get(0));
    }

    @Test
    void anotherTeamsAssetDoesNotResolve() {
        PolicyAsset foreign = save("secret.p12", 99L, new byte[] {1});
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/security/cert-sign",
                                Map.of(),
                                Map.of("p12File", foreign.id())));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        assertFalse(resolved.supportingFiles().containsKey(foreign.id()));
    }

    @Test
    void stepsWithoutBindingsLeaveInputsUntouched() {
        Policy policy = policy(null, new PipelineStep("/api/v1/misc/compress-pdf", Map.of()));
        PolicyInputs inputs = PolicyInputs.of(List.of());

        assertSame(inputs, resolver.resolve(policy, inputs));
        assertTrue(inputs.supportingFiles().isEmpty());
    }

    private PolicyAsset save(String name, Long teamId, byte[] content) {
        return store.save(
                new PolicyAsset(null, name, "application/octet-stream", 0, "owner", teamId, 1L),
                content);
    }

    private static Policy policy(Long teamId, PipelineStep step) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                null,
                List.of(),
                List.of(step),
                OutputSpec.inline(),
                teamId);
    }
}
