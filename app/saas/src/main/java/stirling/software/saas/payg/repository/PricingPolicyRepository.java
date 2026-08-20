package stirling.software.saas.payg.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.payg.policy.PricingPolicy;

@ApplicationScoped
public class PricingPolicyRepository implements PanacheRepositoryBase<PricingPolicy, Long> {

    public Optional<PricingPolicy> findByVersion(String version) {
        return find("version = ?1", version).firstResultOptional();
    }

    public Optional<PricingPolicy> findFirstByIsDefaultTrue() {
        return find("isDefault = true").firstResultOptional();
    }

    /**
     * Atomically clears the isDefault flag on whichever row currently carries it. Returns the count
     * of rows updated (0 if no default existed yet, 1 normally).
     */
    @Transactional
    public int clearDefaultFlag() {
        return (int) update("isDefault = false WHERE isDefault = true");
    }
}
