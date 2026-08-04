package stirling.software.proprietary.security.model;

import java.util.Collection;
import java.util.Collections;

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
