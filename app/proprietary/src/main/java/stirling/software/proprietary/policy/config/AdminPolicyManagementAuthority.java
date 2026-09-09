package stirling.software.proprietary.policy.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/**
 * Default (non-SaaS) policy context: a global admin may edit policies; scoping uses the current
 * user's team (typically a single shared team self-hosted). SaaS overrides this with a team-leader
 * check (see the {@code saas}-profiled implementation).
 */
@Component
@Profile("!saas")
@RequiredArgsConstructor
public class AdminPolicyManagementAuthority implements PolicyManagementAuthority {

    private final UserService userService;

    @Override
    public boolean canEditPolicies() {
        return userService.isCurrentUserAdmin();
    }

    @Override
    public Long currentUserTeamId() {
        String username = userService.getCurrentUsername();
        if (username == null) {
            return null;
        }
        return userService
                .findByUsername(username)
                .map(User::getTeam)
                .map(Team::getId)
                .orElse(null);
    }
}
