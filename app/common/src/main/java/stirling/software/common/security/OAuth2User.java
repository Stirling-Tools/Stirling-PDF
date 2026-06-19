package stirling.software.common.security;

import java.util.Collection;
import java.util.Map;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.oauth2.core.user.OAuth2User}.
 *
 * <p>Represents a user {@link java.security.Principal} authenticated using OAuth 2.0 or OpenID
 * Connect.
 */
public interface OAuth2User {

    Map<String, Object> getAttributes();

    Collection<? extends GrantedAuthority> getAuthorities();

    String getName();
}
