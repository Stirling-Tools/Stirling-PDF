package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** Persistence for the singleton free-tier period anchor. */
public interface FreeTierPeriodRepository extends JpaRepository<FreeTierPeriod, Long> {

    /**
     * Advances the stored period stamp. The {@code <} guard makes the roll monotonic and idempotent
     * under concurrency: two threads that notice the same boundary compute the same new start, so
     * the loser's update is a no-op rather than a lost write, and a stale thread can never drag the
     * stamp backwards onto a period whose counters are already spent.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE FreeTierPeriod p SET p.periodStart = :periodStart, p.updatedAt = :now"
                    + " WHERE p.id = :id AND p.periodStart < :periodStart")
    int rollTo(
            @Param("id") long id,
            @Param("periodStart") LocalDateTime periodStart,
            @Param("now") LocalDateTime now);
}
