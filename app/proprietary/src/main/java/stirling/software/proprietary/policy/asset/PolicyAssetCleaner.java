package stirling.software.proprietary.policy.asset;

import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Removes stored assets that no policy references any more, so replaced certificates/images don't
 * accumulate forever. Runs after a policy save (assets its old version referenced but its new one
 * dropped) and after a policy delete (everything the deleted policy referenced). An asset still
 * referenced by any other policy in the team survives; assets belonging to a different team are
 * never touched, whatever a policy claims.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyAssetCleaner {

    private final PolicyAssetStore assetStore;
    private final PolicyStore policyStore;

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

    private void deleteUnreferenced(Long teamId, Set<String> candidates) {
        if (candidates.isEmpty()) {
            return;
        }
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
    }
}
