package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface FreeTierUsageCounterRepository extends JpaRepository<FreeTierUsageCounter, Long> {

    /**
     * Adds in SQL to avoid a read-modify-write race. Returns 0 when no row exists yet, which the
     * caller then inserts.
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

    /** {@code [category, units]} rows: a total cannot say which meter spent the grant. */
    @Query(
            "SELECT c.category, SUM(c.cumulativeUnits) FROM FreeTierUsageCounter c"
                    + " WHERE c.periodStart = :periodStart GROUP BY c.category")
    java.util.List<Object[]> sumUnitsByCategory(@Param("periodStart") LocalDateTime periodStart);

    /** {@code null} when the period has no rows. */
    @Query(
            "SELECT SUM(c.cumulativeUnits) FROM FreeTierUsageCounter c"
                    + " WHERE c.periodStart = :periodStart")
    Long sumUnits(@Param("periodStart") LocalDateTime periodStart);
}
