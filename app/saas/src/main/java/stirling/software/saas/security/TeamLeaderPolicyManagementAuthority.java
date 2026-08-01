package stirling.software.saas.security;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.config.PolicyManagementAuthority;

/**
 * SaaS policy context: only the LEADER of the current user's team may edit policies, and every user
 * is scoped to their own team. Replaces the self-hosted global-admin check, which is meaningless on
 * SaaS (a single global admin exists for the whole deployment, never per-org) — and the admin gets
 * no cross-team escape: scoping binds them like everyone else.
 */
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
