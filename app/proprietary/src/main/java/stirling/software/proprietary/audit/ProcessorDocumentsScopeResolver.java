package stirling.software.proprietary.audit;

/** Resolves which slice of the documents queue a processor user may see. */
public interface ProcessorDocumentsScopeResolver {

    ProcessorAuditScope resolve();
}
