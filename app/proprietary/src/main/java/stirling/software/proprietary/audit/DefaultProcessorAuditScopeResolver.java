package stirling.software.proprietary.audit;

import org.springframework.stereotype.Component;

/** Self-hosted default: admins see the whole-server audit log, everyone else is denied. */
@Component
public class DefaultProcessorAuditScopeResolver implements ProcessorAuditScopeResolver {

    @Override
    public ProcessorAuditScope resolve() {
        return ProcessorAuditScopeResolver.hasAdminAuthority()
                ? ProcessorAuditScope.server()
                : ProcessorAuditScope.denied();
    }
}
