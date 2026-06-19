package stirling.software.saas.billing.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.billing.model.BillingSubscription;

/** Read/write access to the Stripe subscription mirror table. */
@ApplicationScoped
public class BillingSubscriptionRepository
        implements PanacheRepositoryBase<BillingSubscription, String> {

    public List<BillingSubscription> findByUserId(UUID userId) {
        return find("userId = ?1", userId).list();
    }

    public List<BillingSubscription> findActiveSubscriptionsByUserId(UUID userId) {
        return find(
                        "userId = ?1 and status IN ('active', 'trialing', 'past_due') ORDER BY createdAt DESC",
                        userId)
                .list();
    }

    public boolean existsActiveSubscriptionForUser(UUID userId) {
        return count("userId = ?1 and status IN ('active', 'trialing', 'past_due')", userId) > 0;
    }

    /**
     * Active PAID subscription (excludes trials). 'active' and 'past_due' count as paid; 'trialing'
     * does not.
     */
    public boolean existsActivePaidSubscriptionForUser(UUID userId) {
        return count("userId = ?1 and status IN ('active', 'past_due')", userId) > 0;
    }

    public Optional<BillingSubscription> findLatestActiveSubscription(UUID userId) {
        return findActiveSubscriptionsByUserId(userId).stream().findFirst();
    }

    public boolean existsActiveSubscriptionForTeam(Long teamId) {
        return count("teamId = ?1 and status IN ('active', 'trialing', 'past_due')", teamId) > 0;
    }
}
