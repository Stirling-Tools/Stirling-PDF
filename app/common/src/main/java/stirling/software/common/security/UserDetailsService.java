package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.userdetails.UserDetailsService}.
 *
 * <p>Loads user-specific data, typically as part of an authentication flow.
 */
public interface UserDetailsService {

    /**
     * Locates the user based on the username.
     *
     * @param username the username identifying the user whose data is required
     * @return a fully populated user record, never {@code null}
     * @throws UsernameNotFoundException if the user could not be found
     */
    UserDetails loadUserByUsername(String username) throws UsernameNotFoundException;
}
