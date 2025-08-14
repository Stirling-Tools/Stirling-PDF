package stirling.software.proprietary.security.repository;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

import stirling.software.proprietary.model.AnonymousCreditUsage;

@Repository
public interface AnonymousCreditUsageRepository extends JpaRepository<AnonymousCreditUsage, Long> {

    Optional<AnonymousCreditUsage> findByFingerprintAndMonth(String fingerprint, YearMonth month);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<AnonymousCreditUsage> findByFingerprintAndMonthForUpdate(String fingerprint, YearMonth month);

    @Query(
            "SELECT u FROM AnonymousCreditUsage u WHERE u.fingerprint = :fingerprint ORDER BY u.month DESC")
    List<AnonymousCreditUsage> findByFingerprintOrderByMonthDesc(
            @Param("fingerprint") String fingerprint);

    @Query(
            "SELECT u FROM AnonymousCreditUsage u WHERE u.ipAddress = :ipAddress AND u.month = :month")
    List<AnonymousCreditUsage> findByIpAddressAndMonth(
            @Param("ipAddress") String ipAddress, @Param("month") YearMonth month);

    @Query(
            "SELECT u FROM AnonymousCreditUsage u WHERE u.isBlocked = true ORDER BY u.updatedAt DESC")
    List<AnonymousCreditUsage> findAllBlockedUsers();

    @Query(
            "SELECT u FROM AnonymousCreditUsage u WHERE u.abuseScore >= :threshold ORDER BY u.abuseScore DESC, u.updatedAt DESC")
    List<AnonymousCreditUsage> findHighAbuseScoreUsers(@Param("threshold") int threshold);

    @Query(
            "SELECT u FROM AnonymousCreditUsage u WHERE u.month = :month ORDER BY u.creditsConsumed DESC")
    List<AnonymousCreditUsage> findTopAnonymousConsumersByMonth(@Param("month") YearMonth month);

    @Modifying
    @Query(
            "UPDATE AnonymousCreditUsage u SET u.isBlocked = :blocked WHERE u.fingerprint = :fingerprint")
    int updateBlockedStatus(
            @Param("fingerprint") String fingerprint, @Param("blocked") boolean blocked);

    @Modifying
    @Query("DELETE FROM AnonymousCreditUsage u WHERE u.month < :cutoffMonth")
    int deleteOldRecords(@Param("cutoffMonth") YearMonth cutoffMonth);

    @Query(
            "SELECT COUNT(u) FROM AnonymousCreditUsage u WHERE u.month = :month AND u.lastAccess >= :since")
    long countActiveAnonymousUsers(@Param("month") YearMonth month, @Param("since") Instant since);

    @Query(
            """
        SELECT u FROM AnonymousCreditUsage u
        WHERE u.fingerprint IN :fingerprints
          AND u.month = :month
        """)
    List<AnonymousCreditUsage> findRelatedFingerprints(
            @Param("fingerprints") List<String> fingerprints, @Param("month") YearMonth month);

    default boolean consumeAnonymousCredits(
            String fingerprint, YearMonth month, int creditCost, int monthlyCredits,
            String ipAddress, String userAgent) {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                // Use pessimistic locking to prevent concurrent overspending
                Optional<AnonymousCreditUsage> existingUsage = findByFingerprintAndMonthForUpdate(fingerprint, month);

                AnonymousCreditUsage usage =
                        existingUsage.orElseGet(
                                () -> {
                                    // Create new usage record if it doesn't exist
                                    AnonymousCreditUsage newUsage = AnonymousCreditUsage.builder()
                                            .fingerprint(fingerprint)
                                            .month(month)
                                            .creditsConsumed(0)
                                            .creditsAllocated(monthlyCredits)
                                            .ipAddress(ipAddress)
                                            .userAgent(userAgent)
                                            .abuseScore(0)
                                            .isBlocked(false)
                                            .build();
                                    return saveAndFlush(newUsage);
                                });

                if (Boolean.TRUE.equals(usage.getIsBlocked())) {
                    return false;
                }

                // Check if credits are available
                if (!usage.hasCreditsRemaining(creditCost)) {
                    return false;
                }

                // Consume credits atomically
                usage.setCreditsConsumed(usage.getCreditsConsumed() + creditCost);
                usage.setCreditsAllocated(monthlyCredits);
                usage.setLastAccess(java.time.Instant.now());
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
}
