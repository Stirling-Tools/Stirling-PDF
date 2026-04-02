package stirling.software.proprietary.workflow.dto;

/**
 * API response returned by the certificate pre-validation endpoints. Always returns HTTP 200; the
 * {@code valid} field indicates success. Frontend should use this to display inline feedback before
 * the user completes signing.
 */
public record CertificateValidationResponse(
        boolean valid,
        String subjectName,
        String issuerName,
        /** ISO-8601 formatted expiry date, or null if validation failed. */
        String notAfter,
        /** ISO-8601 formatted start-of-validity date, or null if validation failed. */
        String notBefore,
        boolean selfSigned,
        /** Human-readable error message, or null if valid. */
        String error) {}
