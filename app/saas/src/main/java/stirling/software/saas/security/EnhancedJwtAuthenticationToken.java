package stirling.software.saas.security;

import java.util.Collection;

import org.eclipse.microprofile.jwt.JsonWebToken;

import stirling.software.common.security.AbstractAuthenticationToken;
import stirling.software.common.security.GrantedAuthority;
import stirling.software.proprietary.security.model.User;

/**
 * JWT auth token that exposes the Supabase subject UUID and email alongside the standard claims, so
 * downstream code (audit, credit accounting) can avoid re-parsing the JWT every request.
 *
 * <p>// TODO: Migration required - originally extended {@code
 * org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken}. That
 * Spring type has no Quarkus equivalent; it now extends the {@link AbstractAuthenticationToken}
 * common shim and carries the {@link JsonWebToken} as token/principal. The name is the email.
 */
public class EnhancedJwtAuthenticationToken extends AbstractAuthenticationToken {

    private final JsonWebToken token;
    private final String supabaseId;
    private final String email;
    private final User user;

    public EnhancedJwtAuthenticationToken(
            JsonWebToken jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId) {
        this(jwt, authorities, email, supabaseId, null);
    }

    public EnhancedJwtAuthenticationToken(
            JsonWebToken jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId,
            User user) {
        super(authorities);
        this.token = jwt;
        this.email = email;
        this.supabaseId = supabaseId;
        this.user = user;
        setAuthenticated(true);
    }

    public JsonWebToken getToken() {
        return token;
    }

    /**
     * Returns the resolved local {@link User} when available so shared {@code principal instanceof
     * User} authorization works under JWT auth; falls back to the decoded JWT.
     */
    @Override
    public Object getPrincipal() {
        return user != null ? user : token;
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
