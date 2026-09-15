package stirling.software.saas.security;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.ProcessorAuditScope;
import stirling.software.proprietary.audit.ProcessorAuditScopeResolver;
import stirling.software.proprietary.audit.ProcessorDocumentsScopeResolver;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * SaaS documents visibility: platform admins see the whole server; every other processor user sees
 * their own team's documents (by member email).
 */
@Component
@Primary
@Profile("saas")
@RequiredArgsConstructor
public class SaasProcessorDocumentsScopeResolver implements ProcessorDocumentsScopeResolver {

    private final TeamSecurityExpressions teamSecurity;
    private final TeamMembershipRepository membershipRepository;

    @Override
    public ProcessorAuditScope resolve() {
        if (ProcessorAuditScopeResolver.hasAdminAuthority()) {
            return ProcessorAuditScope.server();
        }
        Long teamId = teamSecurity.currentUserTeamId();
        if (teamId == null) {
            return ProcessorAuditScope.denied();
        }
        List<String> memberEmails =
                membershipRepository.findByTeamId(teamId).stream()
                        .map(m -> m.getUser() == null ? null : m.getUser().getEmail())
                        .filter(Objects::nonNull)
                        .toList();
        return ProcessorAuditScope.team("team:" + teamId, memberEmails);
    }
}
