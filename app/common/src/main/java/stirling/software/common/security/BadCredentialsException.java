package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.authentication.BadCredentialsException}.
 *
 * <p>Thrown if an authentication request is rejected because the credentials are invalid.
 */
public class BadCredentialsException extends AuthenticationException {

    public BadCredentialsException(String msg) {
        super(msg);
    }

    public BadCredentialsException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
