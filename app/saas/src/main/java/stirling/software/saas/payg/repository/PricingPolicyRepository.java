package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.policy.PricingPolicy;

@Repository
public interface PricingPolicyRepository extends JpaRepository<PricingPolicy, Long> {

    Optional<PricingPolicy> findByVersion(String version);

    Optional<PricingPolicy> findFirstByIsDefaultTrue();
}
