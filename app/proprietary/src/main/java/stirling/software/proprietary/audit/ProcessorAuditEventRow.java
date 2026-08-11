package stirling.software.proprietary.audit;

import java.time.Instant;

/**
 * Immutable, cacheable projection of an {@code audit_events} row, shared across processor views.
 */
public record ProcessorAuditEventRow(
        long id, String principal, String type, String data, Instant timestamp) {}
