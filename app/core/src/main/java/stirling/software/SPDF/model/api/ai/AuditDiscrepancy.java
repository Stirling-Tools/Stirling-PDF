package stirling.software.SPDF.model.api.ai;

/**
 * A single mathematical error found by the Python Auditor.
 *
 * @param page        0-indexed page number where the discrepancy appears.
 * @param kind        Category: {@code "tally"}, {@code "arithmetic"}, or {@code "consistency"}.
 * @param severity    {@code "error"} (definite mistake) or {@code "warning"} (possible ambiguity).
 * @param description Human-readable explanation of the error.
 * @param stated      The value as it appears in the document.
 * @param expected    The value the Auditor calculated.
 * @param context     Surrounding text or table fragment for traceability.
 */
public record AuditDiscrepancy(
        int page,
        String kind,
        String severity,
        String description,
        String stated,
        String expected,
        String context) {}
