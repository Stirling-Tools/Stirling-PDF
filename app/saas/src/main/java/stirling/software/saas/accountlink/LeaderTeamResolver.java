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
 * Who is allowed to bind a self-hosted instance to a team.
 *
 * <p>Extracted so registration and connect-approval cannot drift apart on this rule. Both are the
 * same billing-affecting decision, and a difference between them would be a privilege escalation
 * rather than an inconsistency.
 *
 * <p>The team is always derived from the caller's primary membership and never read from a request
 * body, so a caller cannot nominate a team they do not lead.
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

    /**
     * Resolved caller, or an {@code error} status to return ({@code teamId}/{@code userId} null).
     */
    public record LeaderTeam(Long teamId, Long userId, HttpStatus error) {
        public boolean isError() {
            return error != null;
        }
    }

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
        TeamMembership membership = rows.getFirst();
        if (membership.getRole() != TeamRole.LEADER) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        return new LeaderTeam(membership.getTeam().getId(), user.getId(), null);
    }
}
