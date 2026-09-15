package stirling.software.saas.accountlink;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

/** Who is allowed to bind a self-hosted instance to a team. */
@Component
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class LeaderTeamResolver {

    private final UserTeamResolver userTeamResolver;
    private final UserRepository userRepository;

    public LeaderTeamResolver(UserTeamResolver userTeamResolver, UserRepository userRepository) {
        this.userTeamResolver = userTeamResolver;
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

    /** Caller must lead their team. */
    public LeaderTeam resolve(Authentication auth) {
        return resolve(auth, true);
    }

    /** Caller need only belong to a team. */
    public LeaderTeam resolveMember(Authentication auth) {
        return resolve(auth, false);
    }

    private LeaderTeam resolve(Authentication auth, boolean requireLeader) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return new LeaderTeam(null, null, HttpStatus.UNAUTHORIZED);
        }
        Optional<Long> teamId = userTeamResolver.teamId(user);
        if (teamId.isEmpty()) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        if (requireLeader && !userTeamResolver.isLeader(user)) {
            return new LeaderTeam(null, null, HttpStatus.FORBIDDEN);
        }
        return new LeaderTeam(teamId.get(), user.getId(), null);
    }
}
