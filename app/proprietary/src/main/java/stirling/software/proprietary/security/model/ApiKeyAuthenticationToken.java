package stirling.software.proprietary.security.model;

import java.util.Collection;
import java.util.Collections;

// TODO: Migration required - this class extended Spring Security's
// org.springframework.security.authentication.AbstractAuthenticationToken (which implements
// org.springframework.security.core.Authentication). Quarkus has no equivalent token type; the
// runtime principal model is io.quarkus.security.identity.SecurityIdentity, typically built via a
// custom IdentityProvider / SecurityIdentityAugmentor for the API-key auth path. This class has
// been reduced to a plain POJO that preserves the principal/credentials/authorities state and the
// authenticated flag so the API-key user-loading logic can keep populating it. Re-wire it into a
// SecurityIdentity (or replace it entirely) when the API-key authentication filter is migrated.
public class ApiKeyAuthenticationToken {

    private final Object principal;
    private Object credentials;
    private final Collection<String> authorities;
    private boolean authenticated;

    public ApiKeyAuthenticationToken(String apiKey) {
        this.principal = null;
        this.credentials = apiKey;
        this.authorities = Collections.emptyList();
        this.authenticated = false;
    }

    public ApiKeyAuthenticationToken(
            Object principal, String apiKey, Collection<String> authorities) {
        this.principal = principal; // principal can be a UserDetails-like object
        this.credentials = apiKey;
        this.authorities = authorities == null ? Collections.emptyList() : authorities;
        this.authenticated = true; // this authentication is trusted
    }

    public Object getCredentials() {
        return credentials;
    }

    public Object getPrincipal() {
        return principal;
    }

    public Collection<String> getAuthorities() {
        return authorities;
    }

    public boolean isAuthenticated() {
        return authenticated;
    }

    public void setAuthenticated(boolean isAuthenticated) throws IllegalArgumentException {
        if (isAuthenticated) {
            throw new IllegalArgumentException(
                    "Cannot set this token to trusted. Use constructor which takes an authorities list instead.");
        }
        this.authenticated = false;
    }

    public void eraseCredentials() {
        credentials = null;
    }
}
