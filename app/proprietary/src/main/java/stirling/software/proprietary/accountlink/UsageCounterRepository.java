package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** Persistence for the per-period/per-category usage counters (combined-billing "Mode A"). */
public interface UsageCounterRepository extends JpaRepository<UsageCounter, Long> {

    /**
     * Atomically adds {@code delta} to an existing counter row. Returns the number of rows updated
     * (0 when the row doesn't exist yet — the caller then inserts). Doing the add in SQL avoids a
     * read-modify-write race between concurrent billable requests.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE UsageCounter c SET c.cumulativeUnits = c.cumulativeUnits + :delta,"
                    + " c.updatedAt = :now"
                    + " WHERE c.periodStart = :periodStart AND c.category = :category")
    int increment(
            @Param("periodStart") LocalDateTime periodStart,
            @Param("category") String category,
            @Param("delta") long delta,
            @Param("now") LocalDateTime now);

    /** All counters for a period — the daily sync reads these to report cumulative totals. */
    List<UsageCounter> findByPeriodStart(LocalDateTime periodStart);
}
