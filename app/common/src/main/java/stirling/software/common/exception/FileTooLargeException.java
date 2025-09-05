package stirling.software.common.exception;

/** Exception thrown when an uploaded file exceeds the configured maximum size. */
public class FileTooLargeException extends RuntimeException {

    public FileTooLargeException(long maxSize) {
        super("File exceeds maximum size of " + maxSize + " bytes");
    }
}
