package stirling.software.proprietary.security.model;

import java.util.Collection;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;

public class ApiKeyAuthenticationToken extends AbstractAuthenticationToken {

    private final Object principal;
    private Object credentials;
    // How much power the resolving key carries. A PROCESSING key is restricted to the file/PDF
    // endpoints (enforced by ApiKeyProcessingScopeInterceptor) and never confers team-leader
    // powers,
    // regardless of the owner's role - so a shared key is safe.
    private final ApiKeyAccess access;

    public ApiKeyAuthenticationToken(String apiKey) {
        super((Collection<? extends GrantedAuthority>) null);
        this.principal = null;
        this.credentials = apiKey;
        this.access = ApiKeyAccess.FULL;
        setAuthenticated(false);
    }

    public ApiKeyAuthenticationToken(
            Object principal, String apiKey, Collection<? extends GrantedAuthority> authorities) {
        this(principal, apiKey, authorities, ApiKeyAccess.FULL);
    }

    public ApiKeyAuthenticationToken(
            Object principal,
            String apiKey,
            Collection<? extends GrantedAuthority> authorities,
            ApiKeyAccess access) {
        super(authorities);
        this.principal = principal; // principal can be a UserDetails object
        this.credentials = apiKey;
        this.access = access == null ? ApiKeyAccess.FULL : access;
        super.setAuthenticated(true); // this authentication is trusted
    }

    /**
     * How much power this key carries (FULL acts as owner; PROCESSING is file/PDF endpoints only).
     */
    public ApiKeyAccess getAccess() {
        return access;
    }

    /**
     * Whether this key is restricted to file/PDF processing endpoints - true for every shared team
     * key and for any personal key the owner chose to limit. Such a key never confers team-leader
     * or admin powers.
     */
    public boolean isProcessingOnly() {
        return access != null && access.isProcessingOnly();
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
