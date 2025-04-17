package stirling.software.spdf.proprietary.security.model.exception;

public class NoProviderFoundException extends Exception {
    public NoProviderFoundException(String message) {
        super(message);
    }

    public NoProviderFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
