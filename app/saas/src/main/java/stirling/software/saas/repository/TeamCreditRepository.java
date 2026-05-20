package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.saas.model.TeamCredit;

@Repository
public interface TeamCreditRepository extends JpaRepository<TeamCredit, Long> {

    /** Find team credits by team ID. */
    @Query("SELECT tc FROM TeamCredit tc WHERE tc.team.id = :teamId")
    Optional<TeamCredit> findByTeamId(@Param("teamId") Long teamId);

    /**
     * Atomically consume credits from the team pool. Uses the {@code @Version} column on {@link
     * TeamCredit} for optimistic locking - concurrent attempts will fail-fast rather than
     * over-deduct. Returns 1 on success, 0 if insufficient balance or version conflict.
     */
    @Modifying
    @Query(
            value =
                    """
            UPDATE team_credits
            SET cycle_credits_remaining = CASE
                    WHEN cycle_credits_remaining >= :amount THEN cycle_credits_remaining - :amount
                    WHEN cycle_credits_remaining > 0 AND bought_credits_remaining >= (:amount - cycle_credits_remaining)
                    THEN 0
                    ELSE cycle_credits_remaining
                END,
                bought_credits_remaining = CASE
                    WHEN cycle_credits_remaining >= :amount THEN bought_credits_remaining
                    WHEN cycle_credits_remaining > 0 AND bought_credits_remaining >= (:amount - cycle_credits_remaining)
                    THEN bought_credits_remaining - (:amount - cycle_credits_remaining)
                    WHEN cycle_credits_remaining = 0 AND bought_credits_remaining >= :amount
                    THEN bought_credits_remaining - :amount
                    ELSE bought_credits_remaining
                END,
                total_api_calls_made = total_api_calls_made + :amount,
                last_api_usage = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP,
                version = version + 1
            WHERE team_id = :teamId
            AND (cycle_credits_remaining + bought_credits_remaining) >= :amount
            """,
            nativeQuery = true)
    int consumeCredit(@Param("teamId") Long teamId, @Param("amount") int amount);

    @Query(
            "SELECT CASE WHEN COUNT(tc) > 0 THEN true ELSE false END FROM TeamCredit tc WHERE tc.team.id = :teamId")
    boolean existsByTeamId(@Param("teamId") Long teamId);

    @Modifying
    @Query("DELETE FROM TeamCredit tc WHERE tc.team.id = :teamId")
    void deleteByTeamId(@Param("teamId") Long teamId);

    @Query(
            "SELECT tc FROM TeamCredit tc WHERE tc.lastCycleResetAt IS NULL OR tc.lastCycleResetAt < :lastScheduledReset")
    List<TeamCredit> findCreditsNeedingCycleReset(
            @Param("lastScheduledReset") LocalDateTime lastScheduledReset);
}
