package stirling.software.proprietary.policy.asset;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link PolicyAssetCleaner}: assets a policy stops referencing are deleted once no other
 * policy in the team references them, and never across teams.
 */
class PolicyAssetCleanerTest {

    private final InProcessPolicyAssetStore assetStore = new InProcessPolicyAssetStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final PolicyAssetCleaner cleaner = new PolicyAssetCleaner(assetStore, policyStore);

    @Test
    void deletesAssetsDroppedByASave() {
        PolicyAsset dropped = asset("old.png", 7L);
        PolicyAsset kept = asset("kept.png", 7L);
        Policy previous =
                savedPolicy(
                        "p1",
                        7L,
                        step("watermarkImage", dropped.id()),
                        step("stampImage", kept.id()));
        Policy saved = savedPolicy("p1", 7L, step("stampImage", kept.id()));

        cleaner.cleanupAfterSave(previous, saved);

        assertFalse(assetStore.get(dropped.id()).isPresent());
        assertTrue(assetStore.get(kept.id()).isPresent());
    }

    @Test
    void keepsAnAssetAnotherPolicyStillReferences() {
        PolicyAsset shared = asset("shared.p12", 7L);
        savedPolicy("other", 7L, step("p12File", shared.id()));
        Policy deleted =
                new Policy(
                        "gone",
                        "gone",
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(step("p12File", shared.id())),
                        OutputSpec.inline(),
                        7L);

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(shared.id()).isPresent());
    }

    @Test
    void deletesAssetsAfterTheirLastReferencingPolicyIsDeleted() {
        PolicyAsset orphaned = asset("orphan.png", 7L);
        Policy deleted =
                new Policy(
                        "gone",
                        "gone",
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(step("watermarkImage", orphaned.id())),
                        OutputSpec.inline(),
                        7L);

        cleaner.cleanupAfterDelete(deleted);

        assertFalse(assetStore.get(orphaned.id()).isPresent());
    }

    @Test
    void neverDeletesAnotherTeamsAsset() {
        PolicyAsset foreign = asset("foreign.png", 99L);
        Policy deleted =
                new Policy(
                        "gone",
                        "gone",
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(step("watermarkImage", foreign.id())),
                        OutputSpec.inline(),
                        7L);

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(foreign.id()).isPresent());
    }

    private PolicyAsset asset(String name, Long teamId) {
        return assetStore.save(
                new PolicyAsset(null, name, null, 0, "owner", teamId, 1L), new byte[] {1});
    }

    private static PipelineStep step(String field, String assetId) {
        return new PipelineStep("/api/v1/x", Map.of(), Map.of(field, assetId));
    }

    private Policy savedPolicy(String id, Long teamId, PipelineStep... steps) {
        return policyStore.save(
                new Policy(
                        id,
                        id,
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(steps),
                        OutputSpec.inline(),
                        teamId));
    }
}
