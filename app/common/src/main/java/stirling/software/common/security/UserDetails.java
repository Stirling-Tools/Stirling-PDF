package stirling.software.common.security;

import java.util.Collection;

/**
 * Migration compatibility shim for
 * {@code org.springframework.security.core.userdetails.UserDetails}.
 *
 * <p>Provides core user information used by the authentication layer.
 */
public interface UserDetails {

    Collection<? extends GrantedAuthority> getAuthorities();

    String getPassword();

    String getUsername();

    boolean isAccountNonExpired();

    boolean isAccountNonLocked();

    boolean isCredentialsNonExpired();

    boolean isEnabled();
}
