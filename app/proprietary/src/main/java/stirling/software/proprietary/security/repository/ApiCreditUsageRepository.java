package stirling.software.proprietary.security.repository;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import stirling.software.proprietary.model.ApiCreditUsage;
import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.model.User;

@Repository
public interface ApiCreditUsageRepository extends JpaRepository<ApiCreditUsage, Long> {

    Optional<ApiCreditUsage> findByUserAndMonthKey(User user, YearMonth monthKey);

    Optional<ApiCreditUsage> findByOrganizationAndMonthKey(
            Organization organization, YearMonth monthKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ApiCreditUsage> findByUserAndMonthKeyForUpdate(User user, YearMonth monthKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ApiCreditUsage> findByOrganizationAndMonthKeyForUpdate(
            Organization organization, YearMonth monthKey);

    @Query(
            "SELECT COALESCE(u.creditsConsumed, 0) FROM ApiCreditUsage u WHERE u.user = :user AND u.monthKey = :month")
    int getUserCreditsConsumed(@Param("user") User user, @Param("month") YearMonth month);

    @Query(
            "SELECT COALESCE(u.creditsConsumed, 0) FROM ApiCreditUsage u WHERE u.organization = :org AND u.monthKey = :month")
    int getOrgCreditsConsumed(@Param("org") Organization org, @Param("month") YearMonth month);

    // Note: Native MySQL INSERT ON DUPLICATE KEY UPDATE method removed for database portability
    // Use consumeUserCredits() default method instead which handles all database engines

    default boolean consumeUserCredits(
            User user, YearMonth month, int creditCost, int monthlyCredits) {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                // Use pessimistic locking to prevent concurrent overspending
                Optional<ApiCreditUsage> existingUsage = findByUserAndMonthKeyForUpdate(user, month);

                ApiCreditUsage usage =
                        existingUsage.orElseGet(
                                () -> {
                                    // Create new usage record if it doesn't exist
                                    ApiCreditUsage newUsage = ApiCreditUsage.forUser(user, monthlyCredits);
                                    return saveAndFlush(newUsage);
                                });

                // Check if credits are available
                if (!usage.hasCreditsRemaining(creditCost)) {
                    return false;
                }

                // Consume credits atomically
                usage.setCreditsConsumed(usage.getCreditsConsumed() + creditCost);
                usage.setCreditsAllocated(monthlyCredits);
                saveAndFlush(usage);

                return true;
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                // Another thread created/updated concurrently; retry once
                if (attempt == 1) {
                    throw e; // Re-throw if second attempt fails
                }
                // Continue to retry
            }
        }
        return false;
    }

    default boolean consumeOrgCredits(
            Organization org, YearMonth month, int creditCost, int monthlyCredits) {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                // Use pessimistic locking to prevent concurrent overspending
                Optional<ApiCreditUsage> existingUsage = findByOrganizationAndMonthKeyForUpdate(org, month);

                ApiCreditUsage usage =
                        existingUsage.orElseGet(
                                () -> {
                                    // Create new usage record if it doesn't exist
                                    ApiCreditUsage newUsage =
                                            ApiCreditUsage.forOrganization(org, monthlyCredits);
                                    return saveAndFlush(newUsage);
                                });

                // Check if credits are available
                if (!usage.hasCreditsRemaining(creditCost)) {
                    return false;
                }

                // Consume credits atomically
                usage.setCreditsConsumed(usage.getCreditsConsumed() + creditCost);
                usage.setCreditsAllocated(monthlyCredits);
                saveAndFlush(usage);

                return true;
            } catch (org.springframework.dao.DataIntegrityViolationException e) {
                // Another thread created/updated concurrently; retry once
                if (attempt == 1) {
                    throw e; // Re-throw if second attempt fails
                }
                // Continue to retry
            }
        }
        return false;
    }

    List<ApiCreditUsage> findByUserOrderByMonthKeyDesc(User user);

    List<ApiCreditUsage> findByOrganizationOrderByMonthKeyDesc(Organization organization);

    @Query(
            "SELECT u FROM ApiCreditUsage u WHERE u.monthKey = :month ORDER BY u.creditsConsumed DESC")
    List<ApiCreditUsage> findTopConsumersByMonth(@Param("month") YearMonth month);
}
