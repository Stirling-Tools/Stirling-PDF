package stirling.software.SPDF.model.exception;

public class NoProviderFoundException extends Exception {
    public NoProviderFoundException(String message) {
        super(message);
    }

    public NoProviderFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
