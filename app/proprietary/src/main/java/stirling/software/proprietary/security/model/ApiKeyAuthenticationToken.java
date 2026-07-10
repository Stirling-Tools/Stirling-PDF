package stirling.software.proprietary.security.model;

import java.util.Collection;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

public class ApiKeyAuthenticationToken extends AbstractAuthenticationToken {

    private final Object principal;
    private Object credentials;
    // True when the resolving key is team-scoped (shared). Such a key must never confer team-leader
    // powers - it acts at the level of the least-privileged member who can use it.
    private final boolean teamScoped;

    public ApiKeyAuthenticationToken(String apiKey) {
        super((Collection<? extends GrantedAuthority>) null);
        this.principal = null;
        this.credentials = apiKey;
        this.teamScoped = false;
        setAuthenticated(false);
    }

    public ApiKeyAuthenticationToken(
            Object principal, String apiKey, Collection<? extends GrantedAuthority> authorities) {
        this(principal, apiKey, authorities, false);
    }

    public ApiKeyAuthenticationToken(
            Object principal,
            String apiKey,
            Collection<? extends GrantedAuthority> authorities,
            boolean teamScoped) {
        super(authorities);
        this.principal = principal; // principal can be a UserDetails object
        this.credentials = apiKey;
        this.teamScoped = teamScoped;
        super.setAuthenticated(true); // this authentication is trusted
    }

    /** Whether this token came from a shared team key (never grants team-leader authority). */
    public boolean isTeamScoped() {
        return teamScoped;
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
    public void setAuthenticated(boolean isAuthenticated) throws IllegalArgumentException {
        if (isAuthenticated) {
            throw new IllegalArgumentException(
                    "Cannot set this token to trusted. Use constructor which takes a GrantedAuthority list instead.");
        }
        super.setAuthenticated(false);
    }

    @Override
    public void eraseCredentials() {
        super.eraseCredentials();
        credentials = null;
    }
}
