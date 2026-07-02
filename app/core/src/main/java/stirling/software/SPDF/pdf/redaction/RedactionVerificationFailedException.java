package stirling.software.SPDF.pdf.redaction;

/**
 * Thrown when a post-redaction verification pass still finds any of the target strings in the
 * re-parsed PDF text. Indicates that the redaction pipeline did not fully remove the targeted
 * content and the output must not be treated as safe to release.
 */
public class RedactionVerificationFailedException extends RuntimeException {

    public RedactionVerificationFailedException(String message) {
        super(message);
    }

    public RedactionVerificationFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
