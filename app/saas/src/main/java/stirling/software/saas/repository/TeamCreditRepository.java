package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.saas.model.TeamCredit;

@ApplicationScoped
public class TeamCreditRepository implements PanacheRepositoryBase<TeamCredit, Long> {

    /** Find team credits by team ID. */
    public Optional<TeamCredit> findByTeamId(Long teamId) {
        return find("team.id = ?1", teamId).firstResultOptional();
    }

    /**
     * Atomically consume credits from the team pool via native SQL. Returns 1 on success, 0 if
     * insufficient balance.
     */
    @Transactional
    public int consumeCredit(Long teamId, int amount) {
        return getEntityManager()
                .createNativeQuery(
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
                """)
                .setParameter("teamId", teamId)
                .setParameter("amount", amount)
                .executeUpdate();
    }

    public boolean existsByTeamId(Long teamId) {
        return count("team.id = ?1", teamId) > 0;
    }

    @Transactional
    public void deleteByTeamId(Long teamId) {
        delete("team.id = ?1", teamId);
    }

    public List<TeamCredit> findCreditsNeedingCycleReset(LocalDateTime lastScheduledReset) {
        return find("lastCycleResetAt IS NULL OR lastCycleResetAt < ?1", lastScheduledReset).list();
    }
}
