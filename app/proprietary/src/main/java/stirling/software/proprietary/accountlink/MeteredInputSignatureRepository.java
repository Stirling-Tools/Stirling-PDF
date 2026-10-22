package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** Durable per-document step counts; conditional updates serialize concurrent completions. */
public interface MeteredInputSignatureRepository
        extends JpaRepository<MeteredInputSignature, Long> {

    /** The billing state for one run/document key in a period. */
    Optional<MeteredInputSignature> findByPeriodStartAndSignature(
            LocalDateTime periodStart, String signature);

    /** Starts another charge if the window expired or the step limit was reached; 1 means won. */
    @Modifying
    @Transactional
    @Query(
            "UPDATE MeteredInputSignature s SET s.stepCount = 1, s.lastMeteredAt = :now"
                    + " WHERE s.periodStart = :periodStart AND s.signature = :signature"
                    + " AND (s.lastMeteredAt <= :cutoff OR COALESCE(s.stepCount, 1) >= :stepLimit)")
    int restartIfFullOrExpired(
            @Param("periodStart") LocalDateTime periodStart,
            @Param("signature") String signature,
            @Param("now") LocalDateTime now,
            @Param("cutoff") LocalDateTime cutoff,
            @Param("stepLimit") int stepLimit);

    /**
     * Adds a successful step to a current charge with capacity; 1 means joined without charging.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE MeteredInputSignature s SET s.stepCount = COALESCE(s.stepCount, 1) + 1,"
                    + " s.lastMeteredAt = :now"
                    + " WHERE s.periodStart = :periodStart AND s.signature = :signature"
                    + " AND (s.lastMeteredAt IS NULL OR s.lastMeteredAt > :cutoff)"
                    + " AND COALESCE(s.stepCount, 1) < :stepLimit")
    int joinIfWithinLimit(
            @Param("periodStart") LocalDateTime periodStart,
            @Param("signature") String signature,
            @Param("now") LocalDateTime now,
            @Param("cutoff") LocalDateTime cutoff,
            @Param("stepLimit") int stepLimit);
}
