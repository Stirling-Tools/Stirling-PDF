package stirling.software.proprietary.audit;

/** Resolves which slice of the documents queue a portal user may see. */
public interface PortalDocumentsScopeResolver {

    PortalAuditScope resolve();
}
