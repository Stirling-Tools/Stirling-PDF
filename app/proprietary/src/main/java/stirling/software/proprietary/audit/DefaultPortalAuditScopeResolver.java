package stirling.software.proprietary.audit;

import org.springframework.stereotype.Component;

/**
 * Self-hosted default: admins see the whole-server audit log, everyone else is denied. The saas
 * module overrides this with a {@code @Primary} bean that also scopes team leaders to their team.
 */
@Component
public class DefaultPortalAuditScopeResolver implements PortalAuditScopeResolver {

    @Override
    public PortalAuditScope resolve() {
        return PortalAuditScopeResolver.hasAdminAuthority()
                ? PortalAuditScope.server()
                : PortalAuditScope.denied();
    }
}
