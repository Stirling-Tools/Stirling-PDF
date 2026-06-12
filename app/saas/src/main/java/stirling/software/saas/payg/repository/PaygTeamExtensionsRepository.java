package stirling.software.saas.payg.repository;

import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.payg.policy.PaygTeamExtensions;

@ApplicationScoped
public class PaygTeamExtensionsRepository
        implements PanacheRepositoryBase<PaygTeamExtensions, Long> {

    public Optional<PaygTeamExtensions> findByStripeCustomerId(String stripeCustomerId) {
        return find("stripeCustomerId = ?1", stripeCustomerId).firstResultOptional();
    }
}
