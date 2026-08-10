package stirling.software.saas.accountlink;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Resolves the caller's team and asserts they lead it.
 *
 * <p>Binding an instance to a team is a billing action, so both the JWT register path and the
 * pairing approval path must agree on who is allowed to do it. Shared rather than duplicated
 * precisely because it is an authorization rule: two copies could drift and one of them would be
 * wrong.
 */
@Component
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class LeaderTeamResolver {

    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public LeaderTeamResolver(TeamMembershipRepository memberRepo, UserRepository userRepository) {
        this.memberRepo = memberRepo;
        this.userRepository = userRepository;
    }

    /** Resolved caller team, or an {@code error} status to return (ids null when error). */
    public record LeaderTeam(Long teamId, Long userId, HttpStatus error) {}

    public LeaderTeam resolve(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return new LeaderTeam(null, null, HttpStatus.UNAUTHORIZED);
        }
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        if (rows.isEmpty()) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        TeamMembership m = rows.get(0);
        if (m.getRole() != TeamRole.LEADER) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        return new LeaderTeam(m.getTeam().getId(), user.getId(), null);
    }
}
