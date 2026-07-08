package stirling.software.proprietary.audit;

import java.time.Instant;

/**
 * Immutable projection of an {@code audit_events} row. Safe to cache and share across portal views
 * (unlike the mutable JPA entity). One cached list per scope feeds every audit-derived surface, so
 * the DB is scanned once per scope no matter how many tabs map it.
 */
public record PortalAuditEventRow(
        long id, String principal, String type, String data, Instant timestamp) {}
