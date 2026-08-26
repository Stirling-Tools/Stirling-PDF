package stirling.software.proprietary.audit;

import org.springframework.stereotype.Component;

/** Self-hosted default: any processor user sees the whole-server documents queue. */
@Component
public class DefaultProcessorDocumentsScopeResolver implements ProcessorDocumentsScopeResolver {

    @Override
    public ProcessorAuditScope resolve() {
        return ProcessorAuditScope.server();
    }
}
