package stirling.software.saas.billing.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.billing.model.BillingSubscription;

/** Read/write access to the Stripe subscription mirror table. */
@Repository
public interface BillingSubscriptionRepository extends JpaRepository<BillingSubscription, String> {

    List<BillingSubscription> findByUserId(UUID userId);

    @Query(
            "SELECT s FROM BillingSubscription s "
                    + "WHERE s.userId = :userId "
                    + "AND s.status IN ('active', 'trialing', 'past_due') "
                    + "ORDER BY s.createdAt DESC")
    List<BillingSubscription> findActiveSubscriptionsByUserId(@Param("userId") UUID userId);

    @Query(
            "SELECT COUNT(s) > 0 FROM BillingSubscription s "
                    + "WHERE s.userId = :userId "
                    + "AND s.status IN ('active', 'trialing', 'past_due')")
    boolean existsActiveSubscriptionForUser(@Param("userId") UUID userId);

    /**
     * Active PAID subscription (excludes trials). 'active' and 'past_due' count as paid; 'trialing'
     * does not, because trial users can be invited to teams without becoming payers.
     */
    @Query(
            "SELECT COUNT(s) > 0 FROM BillingSubscription s "
                    + "WHERE s.userId = :userId "
                    + "AND s.status IN ('active', 'past_due')")
    boolean existsActivePaidSubscriptionForUser(@Param("userId") UUID userId);

    default Optional<BillingSubscription> findLatestActiveSubscription(UUID userId) {
        return findActiveSubscriptionsByUserId(userId).stream().findFirst();
    }

    @Query(
            "SELECT COUNT(s) > 0 FROM BillingSubscription s "
                    + "WHERE s.teamId = :teamId "
                    + "AND s.status IN ('active', 'trialing', 'past_due')")
    boolean existsActiveSubscriptionForTeam(@Param("teamId") Long teamId);
}
