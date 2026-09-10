package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface FreeTierUsageCounterRepository extends JpaRepository<FreeTierUsageCounter, Long> {

    /**
     * Atomically adds {@code delta} to an existing counter row, returning the rows updated (0 when
     * the row doesn't exist yet — the caller then inserts). Doing the add in SQL avoids a
     * read-modify-write race between concurrent billable requests.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE FreeTierUsageCounter c SET c.cumulativeUnits = c.cumulativeUnits + :delta,"
                    + " c.updatedAt = :now"
                    + " WHERE c.periodStart = :periodStart AND c.category = :category")
    int increment(
            @Param("periodStart") LocalDateTime periodStart,
            @Param("category") String category,
            @Param("delta") long delta,
            @Param("now") LocalDateTime now);

    /**
     * {@code [category, units]} rows. Which meter spent the grant is the first question asked of a
     * figure that looks wrong, and a total cannot answer it: an AI-surface policy step and an
     * automation sub-step are both just units once summed.
     */
    @Query(
            "SELECT c.category, SUM(c.cumulativeUnits) FROM FreeTierUsageCounter c"
                    + " WHERE c.periodStart = :periodStart GROUP BY c.category")
    java.util.List<Object[]> sumUnitsByCategory(@Param("periodStart") LocalDateTime periodStart);

    /** Units spent against the grant in one period, across categories; {@code null} if none. */
    @Query(
            "SELECT SUM(c.cumulativeUnits) FROM FreeTierUsageCounter c"
                    + " WHERE c.periodStart = :periodStart")
    Long sumUnits(@Param("periodStart") LocalDateTime periodStart);
}
