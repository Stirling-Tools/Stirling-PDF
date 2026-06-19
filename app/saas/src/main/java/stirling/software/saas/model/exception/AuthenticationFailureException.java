package stirling.software.saas.model.exception;

import stirling.software.common.security.AuthenticationException;

public class AuthenticationFailureException extends AuthenticationException {

    public AuthenticationFailureException(String message) {
        super(message);
    }

    public AuthenticationFailureException(String message, Throwable cause) {
        super(message, cause);
    }
}
