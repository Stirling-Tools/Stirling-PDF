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
 * run's supporting files, keyed by the step's binding value, team-checked, and winning over
 * anything the run supplied under the same key.
 */
class PolicyAssetResolverTest {

    private final InProcessPolicyAssetStore store = new InProcessPolicyAssetStore();
    private final PolicyAssetResolver resolver = new PolicyAssetResolver(store);

    @Test
    void loadsReferencedAssetsUnderTheStepBindingKey() throws IOException {
        PolicyAsset image = save("logo.png", 7L, new byte[] {1, 2});
        String key = ref(image.id());
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of(),
                                Map.of("watermarkImage", key)));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        List<Resource> bound = resolved.supportingFiles().get(key);
        assertEquals(1, bound.size());
        assertEquals("logo.png", bound.get(0).getFilename());
        assertArrayEquals(new byte[] {1, 2}, bound.get(0).getContentAsByteArray());
    }

    @Test
    void aCommaSeparatedBindingLoadsEveryAssetUnderTheFullKey() {
        PolicyAsset first = save("a.pdf", null, new byte[] {1});
        PolicyAsset second = save("b.pdf", null, new byte[] {2});
        String key = ref(first.id() + "," + second.id());
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
    void storedAssetsWinOverRunSuppliedOnes() throws IOException {
        // Runs are open to the whole team, so a member must not be able to swap a leader-pinned
        // certificate by posting their own file under the binding's key.
        PolicyAsset stored = save("stored.png", null, new byte[] {9});
        String key = ref(stored.id());
        Policy policy =
                policy(
                        null,
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of(),
                                Map.of("watermarkImage", key)));
        Resource supplied = new ByteArrayResource(new byte[] {5});
        PolicyInputs inputs = new PolicyInputs(List.of(), Map.of(key, List.of(supplied)));

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        assertArrayEquals(
                new byte[] {9}, resolved.supportingFiles().get(key).get(0).getContentAsByteArray());
    }

    @Test
    void aLaterStepsStoredBindingStillWinsOverARunSuppliedFile() {
        // The first resolved key seeds the merged map from the run's own files; the second must
        // still overwrite its run-supplied entry rather than read as already resolved.
        PolicyAsset first = save("first.png", null, new byte[] {1});
        PolicyAsset second = save("second.p12", null, new byte[] {2});
        String firstKey = ref(first.id());
        String secondKey = ref(second.id());
        Policy policy =
                new Policy(
                        "p1",
                        "p",
                        "owner",
                        true,
                        List.of(),
                        List.of(
                                new PipelineStep(
                                        "/api/v1/security/add-watermark",
                                        Map.of(),
                                        Map.of("watermarkImage", firstKey)),
                                new PipelineStep(
                                        "/api/v1/security/cert-sign",
                                        Map.of(),
                                        Map.of("p12File", secondKey))),
                        OutputSpec.inline(),
                        null);
        Resource supplied = new ByteArrayResource(new byte[] {5});
        PolicyInputs inputs = new PolicyInputs(List.of(), Map.of(secondKey, List.of(supplied)));

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        assertEquals("second.p12", resolved.supportingFiles().get(secondKey).get(0).getFilename());
    }

    @Test
    void aRunSuppliedKeyIsLeftAlone() {
        // Bindings without the asset: prefix name a file uploaded with the run, as they did before
        // supporting files could be stored.
        Policy policy =
                policy(
                        null,
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of(),
                                Map.of("watermarkImage", "company-logo")));
        Resource supplied = new ByteArrayResource(new byte[] {5});
        PolicyInputs inputs =
                new PolicyInputs(List.of(), Map.of("company-logo", List.of(supplied)));

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        assertSame(inputs, resolved);
        assertSame(supplied, resolved.supportingFiles().get("company-logo").get(0));
    }

    @Test
    void anotherTeamsAssetDoesNotResolve() {
        PolicyAsset foreign = save("secret.p12", 99L, new byte[] {1});
        String key = ref(foreign.id());
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/security/cert-sign", Map.of(), Map.of("p12File", key)));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        assertFalse(resolved.supportingFiles().containsKey(key));
    }

    @Test
    void aBindingWithOneUnresolvableIdResolvesToNothing() {
        // Half a binding would run the step short a file; drop it so the executor fails the run.
        PolicyAsset present = save("a.pdf", null, new byte[] {1});
        String key = ref(present.id() + ",missing-id");
        Policy policy =
                policy(
                        null,
                        new PipelineStep(
                                "/api/v1/general/overlay-pdfs",
                                Map.of(),
                                Map.of("overlayFiles", key)));
        PolicyInputs inputs = PolicyInputs.of(List.of());

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        assertSame(inputs, resolved);
        assertFalse(resolved.supportingFiles().containsKey(key));
    }

    @Test
    void aDeadStoredBindingDoesNotFallBackToTheRunSuppliedFile() {
        // Otherwise losing the pinned asset would hand the binding straight back to the member
        // running the policy - the very override stored assets are meant to prevent.
        String key = ref("missing-id");
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/security/cert-sign", Map.of(), Map.of("p12File", key)));
        PolicyInputs inputs =
                new PolicyInputs(
                        List.of(), Map.of(key, List.of(new ByteArrayResource(new byte[] {5}))));

        PolicyInputs resolved = resolver.resolve(policy, inputs);

        // Key absent, so the executor raises its missing-supporting-file error and the run fails.
        assertFalse(resolved.supportingFiles().containsKey(key));
    }

    @Test
    void aBindingWhoseSecondIdIsAnotherTeamsResolvesToNothing() {
        PolicyAsset own = save("own.pdf", 7L, new byte[] {1});
        PolicyAsset foreign = save("foreign.pdf", 99L, new byte[] {2});
        String key = ref(own.id() + "," + foreign.id());
        Policy policy =
                policy(
                        7L,
                        new PipelineStep(
                                "/api/v1/general/overlay-pdfs",
                                Map.of(),
                                Map.of("overlayFiles", key)));

        PolicyInputs resolved = resolver.resolve(policy, PolicyInputs.of(List.of()));

        assertFalse(resolved.supportingFiles().containsKey(key));
    }

    @Test
    void stepsWithoutBindingsLeaveInputsUntouched() {
        Policy policy = policy(null, new PipelineStep("/api/v1/misc/compress-pdf", Map.of()));
        PolicyInputs inputs = PolicyInputs.of(List.of());

        assertSame(inputs, resolver.resolve(policy, inputs));
        assertTrue(inputs.supportingFiles().isEmpty());
    }

    private static String ref(String ids) {
        return PolicyAssetRefs.PREFIX + ids;
    }

    private PolicyAsset save(String name, Long teamId, byte[] content) {
        return store.save(
                new PolicyAsset(null, name, "application/octet-stream", 0, "owner", teamId, 1L),
                content);
    }

    private static Policy policy(Long teamId, PipelineStep step) {
        return new Policy(
                "p1", "p", "owner", true, List.of(), List.of(step), OutputSpec.inline(), teamId);
    }
}
