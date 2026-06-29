package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Optional;

import stirling.software.proprietary.policy.model.Policy;

/** Stores {@link Policy} definitions. */
public interface PolicyStore {

    /** Create or update; a blank/absent id is assigned. Returns the stored policy. */
    Policy save(Policy policy);

    Optional<Policy> get(String id);

    List<Policy> all();

    /** Policies owned by the given team, loaded scoped rather than fetched globally. */
    List<Policy> findByTeam(Long teamId);

    /** Enabled policies with the given trigger type, for background triggers. */
    List<Policy> findByTriggerType(String triggerType);

    /** Returns whether the policy existed. */
    boolean delete(String id);
}
