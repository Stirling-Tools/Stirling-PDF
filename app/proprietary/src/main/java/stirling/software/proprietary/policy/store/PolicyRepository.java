package stirling.software.proprietary.policy.store;

import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

@ApplicationScoped
public class PolicyRepository implements PanacheRepositoryBase<PolicyEntity, String> {

    /** Enabled policies of a given trigger type, for background triggers to activate. */
    public List<PolicyEntity> findByTriggerTypeAndEnabledTrue(String triggerType) {
        return list("triggerType = ?1 and enabled = true", triggerType);
    }
}
