package stirling.software.proprietary.model.api.ai;

/**
 * A single mathematical error found by the Python Auditor.
 *
 * @param page 0-indexed page number where the discrepancy appears.
 * @param kind Category of the discrepancy.
 * @param severity Whether this is a definite mistake or a possible ambiguity.
 * @param description Human-readable explanation of the error.
 * @param stated The value as it appears in the document.
 * @param expected The value the Auditor calculated.
 * @param context Surrounding text or table fragment for traceability.
 */
public record AuditDiscrepancy(
        int page,
        DiscrepancyKind kind,
        AuditSeverity severity,
        String description,
        String stated,
        String expected,
        String context) {}
