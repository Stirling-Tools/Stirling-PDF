package stirling.software.saas.payg.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

@Repository
public interface PaygTeamExtensionsRepository extends JpaRepository<PaygTeamExtensions, Long> {

    Optional<PaygTeamExtensions> findByStripeCustomerId(String stripeCustomerId);
}
