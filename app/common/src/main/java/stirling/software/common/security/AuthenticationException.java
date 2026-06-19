package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.AuthenticationException}.
 *
 * <p>Abstract superclass for all exceptions related to an {@link Authentication} object being
 * invalid for whatever reason.
 */
public class AuthenticationException extends RuntimeException {

    public AuthenticationException(String msg) {
        super(msg);
    }

    public AuthenticationException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
