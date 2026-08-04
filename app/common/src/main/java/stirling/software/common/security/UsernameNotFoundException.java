package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.userdetails.UsernameNotFoundException}.
 *
 * <p>Thrown if a {@link UserDetailsService} implementation cannot locate a user by its username.
 */
public class UsernameNotFoundException extends AuthenticationException {

    public UsernameNotFoundException(String msg) {
        super(msg);
    }

    public UsernameNotFoundException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
