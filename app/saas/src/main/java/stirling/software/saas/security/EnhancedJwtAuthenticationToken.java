package stirling.software.saas.security;

import java.util.Collection;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import stirling.software.proprietary.security.model.User;

/**
 * JWT auth token that exposes the Supabase subject UUID and email alongside the standard claims, so
 * downstream code (audit, credit accounting) can avoid re-parsing the JWT every request.
 */
public class EnhancedJwtAuthenticationToken extends JwtAuthenticationToken {

    private final String supabaseId;
    private final String email;
    private final User user;

    public EnhancedJwtAuthenticationToken(
            Jwt jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId) {
        this(jwt, authorities, email, supabaseId, null);
    }

    public EnhancedJwtAuthenticationToken(
            Jwt jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId,
            User user) {
        super(jwt, authorities, email);
        this.email = email;
        this.supabaseId = supabaseId;
        this.user = user;
    }

    /**
     * Returns the resolved local {@link User} when available so shared {@code principal instanceof
     * User} authorization works under JWT auth; falls back to the decoded Jwt.
     */
    @Override
    public Object getPrincipal() {
        return user != null ? user : super.getPrincipal();
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
