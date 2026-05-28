package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.policy.PricingPolicy;

@Repository
public interface PricingPolicyRepository extends JpaRepository<PricingPolicy, Long> {

    Optional<PricingPolicy> findByVersion(String version);

    Optional<PricingPolicy> findFirstByIsDefaultTrue();

    /**
     * Atomically clears the {@code is_default} flag on whichever row currently carries it. Used by
     * {@code setDefault(newId)} to free the slot before flipping the new row's flag — the {@code
     * uq_pricing_policy_default} partial unique index would otherwise reject the second row.
     *
     * <p>Returns the count of rows updated (0 if no default existed yet, 1 normally).
     */
    @Modifying
    @Query("UPDATE PricingPolicy p SET p.isDefault = false WHERE p.isDefault = true")
    int clearDefaultFlag();
}
