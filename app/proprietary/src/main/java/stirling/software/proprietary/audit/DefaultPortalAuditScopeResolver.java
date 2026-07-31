package stirling.software.proprietary.audit;

import jakarta.enterprise.context.ApplicationScoped;

/** Self-hosted default: admins see the whole-server audit log, everyone else is denied. */
@ApplicationScoped
public class DefaultPortalAuditScopeResolver implements PortalAuditScopeResolver {

    @Override
    public PortalAuditScope resolve() {
        return PortalAuditScopeResolver.hasAdminAuthority()
                ? PortalAuditScope.server()
                : PortalAuditScope.denied();
    }
}
