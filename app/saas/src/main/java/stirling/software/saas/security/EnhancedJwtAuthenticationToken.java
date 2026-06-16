package stirling.software.saas.security;

import java.util.Collection;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * JWT auth token that exposes the Supabase subject UUID and email alongside the standard claims, so
 * downstream code (audit, credit accounting) can avoid re-parsing the JWT every request.
 */
public class EnhancedJwtAuthenticationToken extends JwtAuthenticationToken {

    private final String supabaseId;
    private final String email;

    public EnhancedJwtAuthenticationToken(
            Jwt jwt,
            Collection<? extends GrantedAuthority> authorities,
            String email,
            String supabaseId) {
        super(jwt, authorities, email);
        this.email = email;
        this.supabaseId = supabaseId;
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
