package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Optional;

import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;

/** Stores {@link Policy} definitions. */
public interface PolicyStore {

    /** Create or update; a blank/absent id is assigned. Returns the stored policy. */
    Policy save(Policy policy);

    Optional<Policy> get(String id);

    List<Policy> all();

    /** Policies owned by the given team, loaded scoped rather than fetched globally. */
    List<Policy> findByTeam(Long teamId);

    /**
     * Whether any policy mentions this stored-asset id, across every team. Asked before reclaiming
     * an asset, so it must answer from the raw stored form: a row {@link #all()} skips as
     * unreadable still holds its certificate hostage, and deleting that would be unrecoverable.
     */
    boolean anyPolicyReferences(String assetId);

    /**
     * Enabled inputs with the given trigger type, as {@code (policy, input)} bindings, so a
     * background trigger fires each input independently and pulls only its own source.
     */
    List<PolicyBinding> findBindingsByTriggerType(String triggerType);

    /**
     * Set the team's run order from {@code orderedIds} (position → sortOrder). Only policies that
     * belong to {@code teamId} are touched; unknown/other-team ids are ignored, so a caller can't
     * reorder across teams. Ids omitted from the list keep their existing order.
     */
    void reorder(Long teamId, List<String> orderedIds);

    /** Returns whether the policy existed. */
    boolean delete(String id);
}
