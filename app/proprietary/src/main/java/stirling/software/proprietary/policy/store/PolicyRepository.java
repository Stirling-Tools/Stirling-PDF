package stirling.software.proprietary.policy.store;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PolicyRepository extends JpaRepository<PolicyEntity, String> {

    /** Enabled policies of a given trigger type, for background triggers to activate. */
    List<PolicyEntity> findByTriggerTypeAndEnabledTrue(String triggerType);
}
