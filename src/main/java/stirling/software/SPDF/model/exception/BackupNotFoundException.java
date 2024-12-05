package stirling.software.SPDF.model.exception;

public class BackupNotFoundException extends RuntimeException {
    public BackupNotFoundException(String message) {
        super(message);
    }

    public BackupNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
