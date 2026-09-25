package stirling.software.saas.security;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * The team a user belongs to for team-scoped reads and billing.
 *
 * <p>{@code users.team_id} is the answer. It is the personal (home) team at signup and is repointed
 * to a joined team only when an invitation is <b>accepted</b> ({@code
 * SaasTeamService.acceptInvitation}); sending an invitation sets {@code invitation.team} and
 * touches neither {@code users.team_id} nor the membership set. So the FK means exactly "home by
 * default, the joined team once you have actually joined" — and it is what enforcement ({@code
 * EntitlementGuard}, {@code PaygChargeInterceptor}) already reads.
 *
 * <p>Team-scoped read endpoints previously resolved the caller from their <b>oldest</b> membership
 * instead. A join keeps the home membership, so the oldest row is permanently the home team: a
 * joined member was shown, and their leader could edit, the home team's wallet and spend cap while
 * being billed against the joined one.
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class UserTeamResolver {

    private final TeamMembershipRepository membershipRepository;

    /**
     * The team to read and bill against, or empty when the user has none. Costs no query: {@code
     * User.team} is an eager association, so it is already loaded with the user.
     */
    public Optional<Long> teamId(User user) {
        if (user == null || user.getTeam() == null) {
            return Optional.empty();
        }
        return Optional.of(user.getTeam().getId());
    }

    /**
     * The user's role in that team. Empty when they have no team or — a data fault, since the FK
     * and the membership row are written together — no membership row for it, in which case they
     * get no leader powers.
     */
    private Optional<TeamRole> role(User user) {
        Optional<Long> teamId = teamId(user);
        if (teamId.isEmpty()) {
            return Optional.empty();
        }
        Optional<TeamRole> role =
                membershipRepository
                        .findByTeamIdAndUserId(teamId.get(), user.getId())
                        .map(m -> m.getRole());
        if (role.isEmpty()) {
            log.warn(
                    "users.team_id={} has no membership row for user {}",
                    teamId.get(),
                    user.getId());
        }
        return role;
    }

    /** Whether the user leads the team they read and bill against. */
    public boolean isLeader(User user) {
        return role(user).filter(r -> r == TeamRole.LEADER).isPresent();
    }
}
