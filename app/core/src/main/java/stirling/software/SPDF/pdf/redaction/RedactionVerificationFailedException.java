package stirling.software.SPDF.pdf.redaction;

/** Thrown when post-redaction verification still finds a target in the saved PDF. */
public class RedactionVerificationFailedException extends RuntimeException {

    public RedactionVerificationFailedException(String message) {
        super(message);
    }

    public RedactionVerificationFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
