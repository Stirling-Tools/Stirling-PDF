package stirling.software.saas.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.service.UserLicenseSettingsService;

/**
 * Members a team's user allowance no longer covers. They keep their membership but are disabled
 * until a place frees up, a leader gives them one, or the allowance rises.
 *
 * <p>Who keeps a place: leaders always; then members a leader chose with "Make active"; then
 * whoever already has one; then the most recent sign-in. Holding a place outranks a recent sign-in,
 * so a disabled member trying to sign in never pushes out someone who still has access.
 *
 * <p>The allowance ({@code max_seats}) is written by the Stripe webhooks, outside this app, so it
 * is applied lazily: every check compares it with the value last applied ({@code
 * capacity_applied_seats}) and applies the difference first. Only a drop below the applied value
 * disables anyone; a first sighting is recorded without disabling, so teams already over their
 * allowance keep everyone until it drops again. Reads fail open: an unapplied migration or a
 * database blip must not lock a team out.
 */
@Slf4j
@Service
@Profile("saas")
public class TeamMemberCapacityService {

    public enum MakeActiveResult {
        ACTIVATED,
        NO_PLACE,
        NOT_DISABLED,
        REPLACE_INVALID,
        /** The database could not answer: the migration is missing or the call failed. */
        UNAVAILABLE
    }

    /** One member as the ranking sees them. */
    record Member(
            long membershipId,
            long userId,
            boolean leader,
            Instant disabledAt,
            Instant pinnedAt,
            Instant lastSignInAt) {}

    static final Comparator<Member> PRIORITY =
            Comparator.comparing(Member::leader)
                    .reversed()
                    .thenComparing(
                            Member::pinnedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(m -> m.disabledAt() != null)
                    .thenComparing(
                            Member::lastSignInAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparingLong(Member::membershipId);

    /** The membership ids that keep a place. Leaders always do, even past the allowance. */
    static Set<Long> keepers(List<Member> members, int places) {
        List<Member> ranked = new ArrayList<>(members);
        ranked.sort(PRIORITY);
        Set<Long> keep = new HashSet<>();
        for (int i = 0; i < ranked.size(); i++) {
            if (ranked.get(i).leader() || i < places) keep.add(ranked.get(i).membershipId());
        }
        return keep;
    }

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactions;

    public TeamMemberCapacityService(
            JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactions = new TransactionTemplate(transactionManager);
        // A refill runs from afterCommit, where the finished transaction is still bound; without
        // its own transaction it would silently join that one.
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public boolean isDisabled(long teamId, long userId) {
        try {
            List<Boolean> current = disabledFlag(teamId, userId);
            if (current == null) {
                apply(teamId, false);
                current = disabledFlag(teamId, userId);
            }
            return current != null && !current.isEmpty() && Boolean.TRUE.equals(current.getFirst());
        } catch (DataAccessException e) {
            log.warn("Member capacity unreadable for team {}: {}", teamId, e.getMessage());
            return false;
        }
    }

    /** Null when the team's allowance changed since it was last applied. */
    private List<Boolean> disabledFlag(long teamId, long userId) {
        List<Object[]> rows =
                jdbcTemplate.query(
                        """
                        SELECT tm.capacity_disabled_at IS NOT NULL, e.max_seats,
                               e.capacity_applied_seats
                        FROM stirling_pdf.team_memberships tm
                        JOIN stirling_pdf.saas_team_extensions e ON e.team_id = tm.team_id
                        WHERE tm.team_id = ? AND tm.user_id = ?
                        """,
                        (rs, i) ->
                                new Object[] {rs.getBoolean(1), rs.getObject(2), rs.getObject(3)},
                        teamId,
                        userId);
        if (rows.isEmpty()) return List.of();
        Object[] row = rows.getFirst();
        if (row[2] == null || !row[2].toString().equals(String.valueOf(row[1]))) return null;
        return List.of((Boolean) row[0]);
    }

    public Set<Long> disabledUserIds(long teamId) {
        try {
            apply(teamId, false);
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
            apply(teamId, true);
        } catch (DataAccessException e) {
            // The departure has committed; the next check or departure fills the place.
            log.warn("Could not refill member places for team {}: {}", teamId, e.getMessage());
        }
    }

    /**
     * Brings the team's flags in line with its allowance. {@code refillOnly} re-ranks without
     * recording the allowance, for a departure; otherwise a drop since the last applied value
     * disables the members past it.
     */
    void apply(long teamId, boolean refillOnly) {
        transactions.executeWithoutResult(
                status -> {
                    List<Integer[]> seats =
                            jdbcTemplate.query(
                                    "SELECT max_seats, capacity_applied_seats"
                                            + " FROM stirling_pdf.saas_team_extensions"
                                            + " WHERE team_id = ? FOR UPDATE",
                                    (rs, i) ->
                                            new Integer[] {
                                                rs.getObject(1) == null ? null : rs.getInt(1),
                                                rs.getObject(2) == null ? null : rs.getInt(2)
                                            },
                                    teamId);
                    if (seats.isEmpty() || seats.getFirst()[0] == null) return;
                    int maxSeats = seats.getFirst()[0];
                    Integer applied = seats.getFirst()[1];
                    if (!refillOnly && applied != null && applied == maxSeats) return;
                    boolean allowDisable = !refillOnly && applied != null && maxSeats < applied;

                    List<Member> members = members(teamId);
                    Set<Long> keep = keepers(members, places(teamId, maxSeats));
                    Timestamp now = Timestamp.from(Instant.now());
                    for (Member m : members) {
                        boolean keeps = keep.contains(m.membershipId());
                        if (keeps && m.disabledAt() != null) {
                            setDisabled(m.membershipId(), null);
                        } else if (!keeps && m.disabledAt() == null && allowDisable) {
                            setDisabled(m.membershipId(), now);
                        }
                    }
                    if (!refillOnly) {
                        jdbcTemplate.update(
                                "UPDATE stirling_pdf.saas_team_extensions"
                                        + " SET capacity_applied_seats = ? WHERE team_id = ?",
                                maxSeats,
                                teamId);
                    }
                });
    }

    /**
     * Gives a disabled member a place, taking it from {@code replaceUserId} when the team is full.
     */
    public MakeActiveResult makeActive(long teamId, long userId, Long replaceUserId) {
        try {
            apply(teamId, false);
            return transactions.execute(
                    status -> {
                        List<Integer> seats =
                                jdbcTemplate.queryForList(
                                        "SELECT max_seats FROM stirling_pdf.saas_team_extensions"
                                                + " WHERE team_id = ? FOR UPDATE",
                                        Integer.class,
                                        teamId);
                        List<Member> members = members(teamId);
                        Optional<Member> target =
                                members.stream()
                                        .filter(m -> m.userId() == userId && m.disabledAt() != null)
                                        .findFirst();
                        if (target.isEmpty() || seats.isEmpty()) {
                            return MakeActiveResult.NOT_DISABLED;
                        }
                        long active = members.stream().filter(m -> m.disabledAt() == null).count();
                        if (active >= places(teamId, seats.getFirst())) {
                            if (replaceUserId == null) return MakeActiveResult.NO_PLACE;
                            Optional<Member> replace =
                                    members.stream()
                                            .filter(
                                                    m ->
                                                            m.userId() == replaceUserId
                                                                    && m.userId() != userId
                                                                    && !m.leader()
                                                                    && m.disabledAt() == null)
                                            .findFirst();
                            if (replace.isEmpty()) return MakeActiveResult.REPLACE_INVALID;
                            jdbcTemplate.update(
                                    "UPDATE stirling_pdf.team_memberships SET"
                                            + " capacity_disabled_at = ?, capacity_pinned_at = NULL"
                                            + " WHERE membership_id = ?",
                                    Timestamp.from(Instant.now()),
                                    replace.get().membershipId());
                        }
                        jdbcTemplate.update(
                                "UPDATE stirling_pdf.team_memberships SET"
                                        + " capacity_disabled_at = NULL, capacity_pinned_at = ?"
                                        + " WHERE membership_id = ?",
                                Timestamp.from(Instant.now()),
                                target.get().membershipId());
                        return MakeActiveResult.ACTIVATED;
                    });
        } catch (DataAccessException e) {
            log.warn(
                    "Could not make member {} active in team {}: {}",
                    userId,
                    teamId,
                    e.getMessage());
            return MakeActiveResult.UNAVAILABLE;
        }
    }

    private List<Member> members(long teamId) {
        return jdbcTemplate.query(
                """
                SELECT tm.membership_id, tm.user_id, tm.role, tm.capacity_disabled_at,
                       tm.capacity_pinned_at, au.last_sign_in_at
                FROM stirling_pdf.team_memberships tm
                JOIN stirling_pdf.users u ON u.user_id = tm.user_id
                LEFT JOIN auth.users au ON au.id = u.supabase_auth_id
                WHERE tm.team_id = ?
                """,
                (rs, i) ->
                        new Member(
                                rs.getLong("membership_id"),
                                rs.getLong("user_id"),
                                "LEADER".equals(rs.getString("role")),
                                instant(rs.getTimestamp("capacity_disabled_at")),
                                instant(rs.getTimestamp("capacity_pinned_at")),
                                instant(rs.getTimestamp("last_sign_in_at"))),
                teamId);
    }

    /**
     * Places for cloud members, counted the way the seat claim counts them: linked deployments'
     * users take places, a linked team's one cloud owner does not, and the free allowance is the
     * floor (a legacy path still writes 1 when a seat plan ends).
     */
    private int places(long teamId, int maxSeats) {
        Integer linked =
                jdbcTemplate.queryForObject(
                        "SELECT COALESCE(SUM(seat_count), 0) FROM stirling_pdf.linked_instance"
                                + " WHERE team_id = ? AND revoked_at IS NULL",
                        Integer.class,
                        teamId);
        Integer owners =
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM stirling_pdf.linked_instance"
                                + " WHERE team_id = ? AND revoked_at IS NULL",
                        Integer.class,
                        teamId);
        int linkedUsers = linked == null ? 0 : linked;
        int ownerCredit = owners != null && owners > 0 ? 1 : 0;
        return Math.max(maxSeats, UserLicenseSettingsService.DEFAULT_USER_LIMIT)
                - linkedUsers
                + ownerCredit;
    }

    private void setDisabled(long membershipId, Timestamp at) {
        jdbcTemplate.update(
                "UPDATE stirling_pdf.team_memberships SET capacity_disabled_at = ?"
                        + " WHERE membership_id = ?",
                at,
                membershipId);
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}
