package stirling.software.saas.payg.repository;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import stirling.software.saas.payg.instance.PaygInstanceUsage;

/** Last-seen cumulative usage per (team, period, category) for linked-instance daily syncs. */
public interface PaygInstanceUsageRepository extends JpaRepository<PaygInstanceUsage, Long> {

    Optional<PaygInstanceUsage> findByTeamIdAndPeriodStartAndCategory(
            Long teamId, LocalDateTime periodStart, String category);

    /**
     * Pessimistic-write variant the ingest uses so two concurrent deliveries of the same sync (e.g.
     * a proxy retry) can't both read the same baseline and double-charge the delta. Must run inside
     * a transaction.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            "SELECT u FROM PaygInstanceUsage u"
                    + " WHERE u.teamId = :teamId AND u.periodStart = :periodStart"
                    + " AND u.category = :category")
    Optional<PaygInstanceUsage> findByTeamIdAndPeriodStartAndCategoryForUpdate(
            @Param("teamId") Long teamId,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("category") String category);
}
