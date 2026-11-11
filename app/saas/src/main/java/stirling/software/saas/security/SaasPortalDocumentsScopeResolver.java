package stirling.software.saas.security;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalAuditScopeResolver;
import stirling.software.proprietary.audit.PortalDocumentsScopeResolver;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * SaaS documents visibility: platform admins see the whole server; every other portal user sees
 * their own team's documents (by member email).
 */
@Component
@Primary
@Profile("saas")
@RequiredArgsConstructor
public class SaasPortalDocumentsScopeResolver implements PortalDocumentsScopeResolver {

    private final TeamSecurityExpressions teamSecurity;
    private final TeamMembershipRepository membershipRepository;

    @Override
    public PortalAuditScope resolve() {
        if (PortalAuditScopeResolver.hasAdminAuthority()) {
            return PortalAuditScope.server();
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
