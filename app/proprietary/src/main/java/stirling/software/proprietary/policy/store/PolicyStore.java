package stirling.software.proprietary.policy.store;

import java.util.List;
import java.util.Optional;

import stirling.software.proprietary.policy.model.Policy;

/**
 * Stores {@link Policy} definitions. The in-memory implementation backs simple deployments now; a
 * durable (JPA) implementation can replace it behind this interface without touching callers.
 */
public interface PolicyStore {

    /** Create or update a policy. A blank/absent id is assigned; returns the stored policy. */
    Policy save(Policy policy);

    Optional<Policy> get(String id);

    List<Policy> all();

    /**
     * Enabled policies whose automatic trigger is of the given type (used by background triggers).
     */
    List<Policy> findByTriggerType(String triggerType);

    /** Remove a policy; returns whether it existed. */
    boolean delete(String id);
}
