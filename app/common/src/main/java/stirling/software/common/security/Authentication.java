package stirling.software.common.security;

import java.security.Principal;
import java.util.Collection;

/**
 * Migration compatibility shim for
 * {@code org.springframework.security.core.Authentication}.
 *
 * <p>Represents the token for an authentication request or for an authenticated principal once the
 * request has been processed.
 */
public interface Authentication extends Principal {

    Collection<? extends GrantedAuthority> getAuthorities();

    Object getCredentials();

    Object getDetails();

    Object getPrincipal();

    boolean isAuthenticated();

    void setAuthenticated(boolean isAuthenticated) throws IllegalArgumentException;

    @Override
    String getName();
}
