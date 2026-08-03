package stirling.software.proprietary.security.model.exception;

public class AuthenticationFailureException extends RuntimeException {
    public AuthenticationFailureException(String message) {
        super(message);
    }

    public AuthenticationFailureException(String message, Throwable cause) {
        super(message, cause);
    }
}
