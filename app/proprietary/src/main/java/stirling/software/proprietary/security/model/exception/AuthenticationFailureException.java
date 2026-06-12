package stirling.software.proprietary.security.model.exception;

// TODO: Migration required - originally extended
// org.springframework.security.core.AuthenticationException (Spring Security). Quarkus has no direct
// equivalent base type; extend RuntimeException so this remains a usable application exception.
// If integrated with quarkus-security, consider mapping to io.quarkus.security.AuthenticationFailedException.
public class AuthenticationFailureException extends RuntimeException {
    public AuthenticationFailureException(String message) {
        super(message);
    }

    public AuthenticationFailureException(String message, Throwable cause) {
        super(message, cause);
    }
}
