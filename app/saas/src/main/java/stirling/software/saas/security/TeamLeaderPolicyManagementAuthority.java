package stirling.software.saas.security;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * SaaS elevated-policy role: only the LEADER of the current user's team may manage all policies.
 * Replaces the self-hosted global-admin check, which is meaningless on SaaS (a single global admin
 * exists for the whole deployment, never per-org).
 */
@Component
@Profile("saas")
@RequiredArgsConstructor
public class TeamLeaderPolicyManagementAuthority implements PolicyManagementAuthority {

    private final TeamSecurityExpressions teamSecurity;

    @Override
    public boolean canManageAllPolicies() {
        return teamSecurity.isCurrentUserTeamLeader();
    }
}
