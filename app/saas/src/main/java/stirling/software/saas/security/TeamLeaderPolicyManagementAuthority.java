package stirling.software.saas.security;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/** SaaS policy authority: only a team leader may edit; scoping uses the current user's team. */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class TeamLeaderPolicyManagementAuthority implements PolicyManagementAuthority {

    private final TeamSecurityExpressions teamSecurity;

    @Override
    public boolean canEditPolicies() {
        return teamSecurity.isCurrentUserTeamLeader();
    }

    @Override
    public Long currentUserTeamId() {
        return teamSecurity.currentUserTeamId();
    }
}
