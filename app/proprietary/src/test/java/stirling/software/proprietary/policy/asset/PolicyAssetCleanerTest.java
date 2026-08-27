package stirling.software.proprietary.policy.asset;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
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
 * policy in the team references them, never across teams, and uploads no policy ever bound are
 * reclaimed by the sweep once they are old enough.
 */
class PolicyAssetCleanerTest {

    private static final Instant NOW = Instant.ofEpochMilli(10_000_000_000L);

    private final InProcessPolicyAssetStore assetStore = new InProcessPolicyAssetStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private final PolicyAssetCleaner cleaner =
            new PolicyAssetCleaner(assetStore, policyStore, () -> NOW);

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
        Policy deleted = policy("gone", 7L, true, step("p12File", shared.id()));

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(shared.id()).isPresent());
    }

    @Test
    void keepsAnAssetOnlyAPausedPolicyReferences() {
        // Pausing is a re-save with enabled=false, so reference counting must span every policy in
        // the team, not just the enabled ones.
        PolicyAsset shared = asset("paused.p12", 7L);
        policyStore.save(policy("paused", 7L, false, step("p12File", shared.id())));
        Policy deleted = policy("gone", 7L, true, step("p12File", shared.id()));

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(shared.id()).isPresent());
    }

    @Test
    void deletesAssetsAfterTheirLastReferencingPolicyIsDeleted() {
        PolicyAsset orphaned = asset("orphan.png", 7L);
        Policy deleted = policy("gone", 7L, true, step("watermarkImage", orphaned.id()));

        cleaner.cleanupAfterDelete(deleted);

        assertFalse(assetStore.get(orphaned.id()).isPresent());
    }

    @Test
    void neverDeletesAnotherTeamsAsset() {
        PolicyAsset foreign = asset("foreign.png", 99L);
        Policy deleted = policy("gone", 7L, true, step("watermarkImage", foreign.id()));

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(foreign.id()).isPresent());
    }

    @Test
    void ignoresARunSuppliedFileKey() {
        // No asset: prefix, so the binding names a run-supplied file and nothing is a candidate.
        PolicyAsset unrelated = asset("unrelated.png", 7L);
        Policy deleted =
                policy(
                        "gone",
                        7L,
                        true,
                        new PipelineStep("/api/v1/x", Map.of(), Map.of("watermarkImage", "logo")));

        cleaner.cleanupAfterDelete(deleted);

        assertTrue(assetStore.get(unrelated.id()).isPresent());
    }

    @Test
    void swallowsAStoreFailureSoTheCallersOwnWorkIsNotLost() {
        // The policy write has already committed by the time cleanup runs.
        PolicyAsset orphaned = asset("orphan.png", 7L);
        PolicyStore failing = mock(PolicyStore.class);
        when(failing.findByTeam(any())).thenThrow(new RuntimeException("db down"));
        PolicyAssetCleaner guarded = new PolicyAssetCleaner(assetStore, failing, () -> NOW);
        Policy deleted = policy("gone", 7L, true, step("watermarkImage", orphaned.id()));

        assertDoesNotThrow(() -> guarded.cleanupAfterDelete(deleted));
        assertTrue(assetStore.get(orphaned.id()).isPresent());
    }

    @Test
    void sweepDeletesAnUploadNoPolicyEverReferenced() {
        PolicyAsset abandoned = agedAsset("abandoned.p12", NOW.toEpochMilli() - dayMillis(2), 7L);

        cleaner.sweepAbandonedUploads();

        assertFalse(assetStore.get(abandoned.id()).isPresent());
    }

    @Test
    void sweepKeepsARecentUpload() {
        // The grace window is what stops the sweep racing a builder session that is mid-save.
        PolicyAsset justUploaded = agedAsset("fresh.p12", NOW.toEpochMilli() - 60_000L, 7L);

        cleaner.sweepAbandonedUploads();

        assertTrue(assetStore.get(justUploaded.id()).isPresent());
    }

    @Test
    void sweepKeepsAnOldAssetAPolicyStillReferences() {
        PolicyAsset bound = agedAsset("bound.p12", NOW.toEpochMilli() - dayMillis(30), 7L);
        savedPolicy("p1", 7L, step("p12File", bound.id()));

        cleaner.sweepAbandonedUploads();

        assertTrue(assetStore.get(bound.id()).isPresent());
    }

    @Test
    void sweepReclaimsAcrossTeams() {
        // An abandoned upload is unreferenced everywhere or nowhere, so the sweep is not scoped.
        PolicyAsset teamSeven = agedAsset("seven.png", NOW.toEpochMilli() - dayMillis(2), 7L);
        PolicyAsset teamNinetyNine = agedAsset("99.png", NOW.toEpochMilli() - dayMillis(2), 99L);

        cleaner.sweepAbandonedUploads();

        assertFalse(assetStore.get(teamSeven.id()).isPresent());
        assertFalse(assetStore.get(teamNinetyNine.id()).isPresent());
    }

    private static long dayMillis(int days) {
        return days * 24L * 60L * 60L * 1000L;
    }

    private PolicyAsset asset(String name, Long teamId) {
        return assetStore.save(
                new PolicyAsset(null, name, null, 0, "owner", teamId, 1L), new byte[] {1});
    }

    private PolicyAsset agedAsset(String name, long createdAt, Long teamId) {
        return assetStore.save(
                new PolicyAsset(null, name, null, 0, "owner", teamId, createdAt), new byte[] {1});
    }

    private static PipelineStep step(String field, String assetId) {
        return new PipelineStep(
                "/api/v1/x", Map.of(), Map.of(field, PolicyAssetRefs.PREFIX + assetId));
    }

    private static Policy policy(String id, Long teamId, boolean enabled, PipelineStep... steps) {
        return new Policy(
                id, id, "owner", enabled, List.of(), List.of(steps), OutputSpec.inline(), teamId);
    }

    private Policy savedPolicy(String id, Long teamId, PipelineStep... steps) {
        return policyStore.save(policy(id, teamId, true, steps));
    }
}
