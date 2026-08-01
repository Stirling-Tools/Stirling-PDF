package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.proprietary.security.model.User;

/** Unit tests for {@link EnhancedJwtAuthenticationToken}. */
class EnhancedJwtAuthenticationTokenTest {

    private static Jwt sampleJwt(String subject) {
        return new Jwt(
                "tok",
                Instant.now(),
                Instant.now().plusSeconds(60),
                Map.of("alg", "HS256"),
                Map.of("sub", subject));
    }

    @Test
    @DisplayName("four-arg constructor leaves user null so principal falls back to the Jwt")
    void fourArgConstructorPrincipalIsJwt() {
        Jwt jwt = sampleJwt(UUID.randomUUID().toString());
        EnhancedJwtAuthenticationToken token =
                new EnhancedJwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        "alice@example.com",
                        "sub-123");

        assertThat(token.getPrincipal()).isSameAs(jwt);
        assertThat(token.getEmail()).isEqualTo("alice@example.com");
        assertThat(token.getSupabaseId()).isEqualTo("sub-123");
    }

    @Test
    @DisplayName("five-arg constructor with a user exposes that user as principal")
    void fiveArgConstructorPrincipalIsUser() {
        Jwt jwt = sampleJwt(UUID.randomUUID().toString());
        User user = new User();
        user.setUsername("bob@example.com");
        EnhancedJwtAuthenticationToken token =
                new EnhancedJwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        "bob@example.com",
                        "sub-456",
                        user);

        assertThat(token.getPrincipal()).isSameAs(user);
        assertThat(token.getEmail()).isEqualTo("bob@example.com");
        assertThat(token.getSupabaseId()).isEqualTo("sub-456");
    }

    @Test
    @DisplayName("five-arg constructor with null user falls back to the Jwt principal")
    void fiveArgConstructorNullUserFallsBackToJwt() {
        Jwt jwt = sampleJwt(UUID.randomUUID().toString());
        EnhancedJwtAuthenticationToken token =
                new EnhancedJwtAuthenticationToken(
                        jwt, List.of(new SimpleGrantedAuthority("ROLE_USER")), null, null, null);

        assertThat(token.getPrincipal()).isSameAs(jwt);
        assertThat(token.getEmail()).isNull();
        assertThat(token.getSupabaseId()).isNull();
    }

    @Test
    @DisplayName("toString includes email, supabaseId, and authorities")
    void toStringContainsKeyFields() {
        Jwt jwt = sampleJwt(UUID.randomUUID().toString());
        EnhancedJwtAuthenticationToken token =
                new EnhancedJwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        "carol@example.com",
                        "sub-789");

        String text = token.toString();
        assertThat(text)
                .contains("EnhancedJwtAuthenticationToken")
                .contains("email=carol@example.com")
                .contains("supabaseId=sub-789")
                .contains("ROLE_USER");
    }
}
