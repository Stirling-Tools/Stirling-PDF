package stirling.software.saas.security;

import java.util.Collection;

import org.eclipse.microprofile.jwt.JsonWebToken;

import stirling.software.common.security.AbstractAuthenticationToken;
import stirling.software.common.security.GrantedAuthority;

/**
 * JWT auth token that exposes the Supabase subject UUID and email alongside the standard claims, so
 * downstream code (audit, credit accounting) can avoid re-parsing the JWT every request.
 *
 * <p>// TODO: Migration required - originally extended {@code
 * org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken}. That
 * Spring type has no Quarkus equivalent; it now extends the {@link AbstractAuthenticationToken}
 * common shim and carries the {@link JsonWebToken} as both token and principal. The name is the
 * email (matching the previous {@code super(jwt, authorities, email)} name argument).
 */
public class EnhancedJwtAuthenticationToken extends AbstractAuthenticationToken {

    private final JsonWebToken token;
    private final String supabaseId;
    private final String email;

    public EnhancedJwtAuthenticationToken(
            JsonWebToken jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId) {
        super(authorities);
        this.token = jwt;
        this.email = email;
        this.supabaseId = supabaseId;
        setAuthenticated(true);
    }

    public JsonWebToken getToken() {
        return token;
    }

    @Override
    public Object getPrincipal() {
        return token;
    }

    @Override
    public Object getCredentials() {
        return token;
    }

    @Override
    public String getName() {
        return email;
    }

    public String getSupabaseId() {
        return supabaseId;
    }

    public String getEmail() {
        return email;
    }

    @Override
    public String toString() {
        return "EnhancedJwtAuthenticationToken[email="
                + email
                + ", supabaseId="
                + supabaseId
                + ", authorities="
                + getAuthorities()
                + "]";
    }
}
