package stirling.software.common.security;

import java.util.Collection;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.authentication.UsernamePasswordAuthenticationToken}.
 *
 * <p>An {@link Authentication} implementation designed for simple presentation of a username and
 * password.
 */
public class UsernamePasswordAuthenticationToken extends AbstractAuthenticationToken {

    private final Object principal;
    private Object credentials;

    /** Creates an unauthenticated token (typically used as an authentication request). */
    public UsernamePasswordAuthenticationToken(Object principal, Object credentials) {
        super(null);
        this.principal = principal;
        this.credentials = credentials;
        setAuthenticated(false);
    }

    /** Creates an authenticated token (typically the result of a successful authentication). */
    public UsernamePasswordAuthenticationToken(
            Object principal,
            Object credentials,
            Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.principal = principal;
        this.credentials = credentials;
        super.setAuthenticated(true);
    }

    /** Factory method mirroring Spring Security 6 for creating an unauthenticated token. */
    public static UsernamePasswordAuthenticationToken unauthenticated(
            Object principal, Object credentials) {
        return new UsernamePasswordAuthenticationToken(principal, credentials);
    }

    /** Factory method mirroring Spring Security 6 for creating an authenticated token. */
    public static UsernamePasswordAuthenticationToken authenticated(
            Object principal,
            Object credentials,
            Collection<? extends GrantedAuthority> authorities) {
        return new UsernamePasswordAuthenticationToken(principal, credentials, authorities);
    }

    @Override
    public Object getCredentials() {
        return credentials;
    }

    @Override
    public Object getPrincipal() {
        return principal;
    }

    @Override
    public String getName() {
        if (principal instanceof UserDetails) {
            return ((UserDetails) principal).getUsername();
        }
        return principal == null ? null : principal.toString();
    }
}
