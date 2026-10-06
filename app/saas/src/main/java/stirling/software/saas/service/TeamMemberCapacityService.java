package stirling.software.saas.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Members a team's user allowance no longer covers. When an allowance drops, Postgres disables the
 * members past it ({@code stirling_pdf.apply_team_member_capacity}, run by a trigger on {@code
 * max_seats}); this service reads the result and makes the two writes that come from the app: a
 * place freeing up when someone leaves, and a leader choosing who has one.
 *
 * <p>The ranking lives only in SQL so the trigger and the app can never disagree about who keeps a
 * place. Reads fail open: an unapplied migration or a database blip must not lock a team out.
 */
@Slf4j
@Service
@Profile("saas")
@RequiredArgsConstructor
public class TeamMemberCapacityService {

    public enum MakeActiveResult {
        ACTIVATED,
        NO_PLACE,
        NOT_DISABLED,
        REPLACE_INVALID
    }

    private final JdbcTemplate jdbcTemplate;

    public boolean isDisabled(long teamId, long userId) {
        try {
            List<Boolean> rows =
                    jdbcTemplate.query(
                            "SELECT capacity_disabled_at IS NOT NULL FROM stirling_pdf.team_memberships"
                                    + " WHERE team_id = ? AND user_id = ?",
                            (rs, i) -> rs.getBoolean(1),
                            teamId,
                            userId);
            return !rows.isEmpty() && Boolean.TRUE.equals(rows.getFirst());
        } catch (DataAccessException e) {
            log.warn("Member capacity unreadable for team {}: {}", teamId, e.getMessage());
            return false;
        }
    }

    public Set<Long> disabledUserIds(long teamId) {
        try {
            return new HashSet<>(
                    jdbcTemplate.queryForList(
                            "SELECT user_id FROM stirling_pdf.team_memberships"
                                    + " WHERE team_id = ? AND capacity_disabled_at IS NOT NULL",
                            Long.class,
                            teamId));
        } catch (DataAccessException e) {
            log.warn("Member capacity unreadable for team {}: {}", teamId, e.getMessage());
            return Set.of();
        }
    }

    /**
     * Gives freed places to disabled members once the caller's transaction commits, so the
     * departure it records is visible to the ranking. Never disables anyone.
     */
    public void refillAfterCommit(long teamId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            refill(teamId);
                        }
                    });
        } else {
            refill(teamId);
        }
    }

    private void refill(long teamId) {
        try {
            jdbcTemplate.queryForObject(
                    "SELECT stirling_pdf.apply_team_member_capacity(?, false)",
                    Integer.class,
                    teamId);
        } catch (DataAccessException e) {
            // The departure has committed; the next allowance change or departure fills the place.
            log.warn("Could not refill member places for team {}: {}", teamId, e.getMessage());
        }
    }

    /**
     * Gives a disabled member a place, taking it from {@code replaceUserId} when the team is full.
     */
    public MakeActiveResult makeActive(long teamId, long userId, Long replaceUserId) {
        String result =
                jdbcTemplate.queryForObject(
                        "SELECT stirling_pdf.make_team_member_active(?, ?, ?)",
                        String.class,
                        teamId,
                        userId,
                        replaceUserId);
        return switch (result == null ? "" : result) {
            case "activated" -> MakeActiveResult.ACTIVATED;
            case "no_place" -> MakeActiveResult.NO_PLACE;
            case "not_disabled" -> MakeActiveResult.NOT_DISABLED;
            case "replace_invalid" -> MakeActiveResult.REPLACE_INVALID;
            default -> throw new IllegalStateException("Unexpected make-active result: " + result);
        };
    }
}
