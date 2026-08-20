package stirling.software.proprietary.policy.asset;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Removes stored assets that no policy references any more, so replaced certificates/images don't
 * accumulate. Runs after a policy save (assets its old version referenced but its new one dropped)
 * and after a policy delete (everything the deleted policy referenced). An asset still referenced
 * by any other policy in the team survives; assets belonging to a different team are never touched,
 * whatever a policy claims.
 *
 * <p>Those two hooks only ever see ids a policy once referenced, so an upload abandoned before any
 * policy bound it is reclaimed by {@link #sweepAbandonedUploads()} instead. Cleanup is best-effort
 * throughout: the policy write has already committed, so a failure is logged, not propagated.
 */
@Slf4j
@ApplicationScoped
// PolicyStore's only bean (JpaPolicyStore) is saas-gated, so this must be too or CDI cannot
// satisfy it in the other flavors.
@IfBuildProfile("saas")
public class PolicyAssetCleaner {

    // An upload sits unreferenced until the save that binds it, so the window has to outlast a
    // builder session comfortably.
    private static final Duration ABANDONED_UPLOAD_AGE = Duration.ofDays(1);

    private final PolicyAssetStore assetStore;
    private final PolicyStore policyStore;
    private final Supplier<Instant> clock;

    @Inject
    public PolicyAssetCleaner(PolicyAssetStore assetStore, PolicyStore policyStore) {
        this(assetStore, policyStore, Instant::now);
    }

    // Clock seam so tests can pin "now"; the runtime bean uses the wall clock above.
    PolicyAssetCleaner(
            PolicyAssetStore assetStore, PolicyStore policyStore, Supplier<Instant> clock) {
        this.assetStore = assetStore;
        this.policyStore = policyStore;
        this.clock = clock;
    }

    /**
     * After an update: drop assets the previous version referenced and the new one no longer does.
     */
    public void cleanupAfterSave(Policy previous, Policy saved) {
        if (previous == null) {
            return;
        }
        Set<String> dropped = new HashSet<>(PolicyAssetRefs.referencedAssetIds(previous.steps()));
        dropped.removeAll(PolicyAssetRefs.referencedAssetIds(saved.steps()));
        deleteUnreferenced(saved.teamId(), dropped);
    }

    /** After a delete: drop everything the deleted policy referenced, if now unreferenced. */
    public void cleanupAfterDelete(Policy deleted) {
        deleteUnreferenced(deleted.teamId(), PolicyAssetRefs.referencedAssetIds(deleted.steps()));
    }

    /**
     * Uploads no policy ever bound: the save/delete hooks never see these ids, so without this they
     * would keep their (up to 50 MB) bytes forever. Deliberately not team-scoped - an abandoned
     * upload is unreferenced everywhere or nowhere. Runs at startup too, so an instance restarted
     * more often than daily still reclaims; the age cutoff is what keeps fresh uploads safe.
     */
    @Scheduled(every = "24h", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    public void sweepAbandonedUploads() {
        long cutoff = clock.get().minus(ABANDONED_UPLOAD_AGE).toEpochMilli();
        try {
            for (String id : assetStore.idsCreatedBefore(cutoff)) {
                if (!policyStore.anyPolicyReferences(id) && assetStore.delete(id)) {
                    log.debug("Deleted abandoned policy asset {}", id);
                }
            }
        } catch (RuntimeException e) {
            log.warn("Abandoned policy asset sweep failed: {}", e.getMessage(), e);
        }
    }

    private void deleteUnreferenced(Long teamId, Set<String> candidates) {
        if (candidates.isEmpty()) {
            return;
        }
        try {
            Set<String> stillReferenced = new HashSet<>();
            for (Policy policy : policyStore.findByTeam(teamId)) {
                stillReferenced.addAll(PolicyAssetRefs.referencedAssetIds(policy.steps()));
            }
            for (String id : candidates) {
                if (stillReferenced.contains(id)) {
                    continue;
                }
                assetStore
                        .get(id)
                        .filter(asset -> Objects.equals(asset.teamId(), teamId))
                        .ifPresent(
                                asset -> {
                                    assetStore.delete(id);
                                    log.debug(
                                            "Deleted unreferenced policy asset {} ({})",
                                            id,
                                            asset.fileName());
                                });
            }
        } catch (RuntimeException e) {
            // The save/delete already committed: failing here must not fail the request or skip
            // the caller's trigger re-sync.
            log.warn("Policy asset cleanup failed for team {}: {}", teamId, e.getMessage(), e);
        }
    }
}
