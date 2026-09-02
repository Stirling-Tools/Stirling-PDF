package stirling.software.saas.security;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Primary;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.PortalAuditScope;
import stirling.software.proprietary.audit.PortalAuditScopeResolver;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/** SaaS audit visibility: admins see the server; team LEADERs see their team (by member email). */
@ApplicationScoped
@Primary
@IfBuildProfile("saas")
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
