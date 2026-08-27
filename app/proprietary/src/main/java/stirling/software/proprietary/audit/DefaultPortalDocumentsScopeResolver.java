package stirling.software.proprietary.audit;

import org.springframework.stereotype.Component;

/** Self-hosted default: any portal user sees the whole-server documents queue. */
@Component
public class DefaultPortalDocumentsScopeResolver implements PortalDocumentsScopeResolver {

    @Override
    public PortalAuditScope resolve() {
        return PortalAuditScope.server();
    }
}
