package stirling.software.proprietary.policy.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.UserServiceInterface;

/**
 * Default (non-SaaS) elevated-policy role: a global admin. SaaS overrides this with a team-leader
 * check (see the {@code saas}-profiled implementation).
 */
@Component
@Profile("!saas")
@RequiredArgsConstructor
public class AdminPolicyManagementAuthority implements PolicyManagementAuthority {

    private final UserServiceInterface userService;

    @Override
    public boolean canManageAllPolicies() {
        return userService.isCurrentUserAdmin();
    }
}
