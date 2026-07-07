package stirling.software.saas.security;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalAuditScopeResolver;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * SaaS audit visibility: an admin sees the whole server; a team {@code LEADER} sees only their own
 * team's events; everyone else is denied. Overrides {@link DefaultPortalAuditScopeResolver} via
 * {@code @Primary} in the saas profile.
 *
 * <p>Scoping is by {@code principal}: in saas the audit principal is the user's email (the Supabase
 * JWT name), so the team's member emails are exactly the principals to filter on.
 */
@Component
@Primary
@Profile("saas")
@RequiredArgsConstructor
public class SaasPortalAuditScopeResolver implements PortalAuditScopeResolver {

    private final TeamSecurityExpressions teamSecurity;
    private final TeamMembershipRepository membershipRepository;

    @Override
    public PortalAuditScope resolve() {
        if (PortalAuditScopeResolver.hasAdminAuthority()) {
            return PortalAuditScope.server();
        }
        if (!teamSecurity.isCurrentUserTeamLeader()) {
            return PortalAuditScope.denied();
        }
        Long teamId = teamSecurity.currentUserTeamId();
        if (teamId == null) {
            return PortalAuditScope.denied();
        }
        List<String> memberEmails =
                membershipRepository.findByTeamId(teamId).stream()
                        .map(m -> m.getUser() == null ? null : m.getUser().getEmail())
                        .filter(Objects::nonNull)
                        .toList();
        return PortalAuditScope.team("team:" + teamId, memberEmails);
    }
}
