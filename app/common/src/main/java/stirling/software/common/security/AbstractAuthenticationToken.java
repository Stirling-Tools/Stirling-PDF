package stirling.software.common.security;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.authentication.AbstractAuthenticationToken}.
 *
 * <p>Base implementation of {@link Authentication} holding authorities, details and an
 * authenticated flag.
 */
public abstract class AbstractAuthenticationToken implements Authentication {

    private final List<GrantedAuthority> authorities;
    private Object details;
    private boolean authenticated = false;

    protected AbstractAuthenticationToken(Collection<? extends GrantedAuthority> authorities) {
        if (authorities == null) {
            this.authorities = Collections.emptyList();
        } else {
            List<GrantedAuthority> copy = new ArrayList<>(authorities.size());
            for (GrantedAuthority authority : authorities) {
                copy.add(authority);
            }
            this.authorities = Collections.unmodifiableList(copy);
        }
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getDetails() {
        return details;
    }

    public void setDetails(Object details) {
        this.details = details;
    }

    @Override
    public boolean isAuthenticated() {
        return authenticated;
    }

    @Override
    public void setAuthenticated(boolean authenticated) throws IllegalArgumentException {
        this.authenticated = authenticated;
    }

    @Override
    public String getName() {
        Object principal = getPrincipal();
        if (principal instanceof UserDetails) {
            return ((UserDetails) principal).getUsername();
        }
        return principal == null ? null : principal.toString();
    }
}
