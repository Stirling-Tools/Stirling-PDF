package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.SupabaseSecurityConfig.SupabaseTokenValidator;

/** Unit tests for the JWT-claim → Spring authorities mapping. */
class SupabaseSecurityConfigTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void anonymousJwtGetsLimitedApiUserRole() {
        Jwt jwt = jwtWith(true, null, null, null, List.of());
        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(authorityNames(auth)).contains("ROLE_LIMITED_API_USER");
        assertThat(authorityNames(auth)).doesNotContain("ROLE_USER");
        assertThat(((EnhancedJwtAuthenticationToken) auth).getEmail()).isNull();
    }

    @Test
    void authenticatedJwtGetsUserRole() {
        Jwt jwt = jwtWith(false, "alice@example.com", "authenticated", null, List.of());
        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(authorityNames(auth))
                .contains("ROLE_USER", "ROLE_authenticated")
                .doesNotContain("ROLE_LIMITED_API_USER");
        assertThat(((EnhancedJwtAuthenticationToken) auth).getEmail())
                .isEqualTo("alice@example.com");
    }

    @Test
    void appRoleClaimAddsUppercasedRole() {
        Jwt jwt = jwtWith(false, "admin@example.com", "authenticated", "admin", List.of());
        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(authorityNames(auth)).contains("ROLE_ADMIN");
    }

    @Test
    void permissionsClaimMapsToPermPrefixedAuthorities() {
        Jwt jwt =
                jwtWith(
                        false,
                        "alice@example.com",
                        "authenticated",
                        null,
                        List.of("ocr.run", "merge.run"));
        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(authorityNames(auth)).contains("PERM_ocr.run", "PERM_merge.run");
    }

    @Test
    void blankRoleAndPermsAreIgnored() {
        Jwt jwt = jwtWith(false, "x@example.com", "", "  ", List.of("", " "));
        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        // Only ROLE_USER (the default for non-anonymous), no blank ROLE_ or PERM_ entries.
        assertThat(authorityNames(auth))
                .containsExactly("ROLE_USER")
                .doesNotContain("ROLE_", "PERM_");
    }

    @Test
    void carriesUserPrincipalFromContextBuiltByAuthFilter() {
        Jwt jwt = jwtWith(false, "alice@example.com", "authenticated", null, List.of());
        User user = new User();
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new EnhancedJwtAuthenticationToken(
                                jwt, List.of(), "alice@example.com", jwt.getSubject(), user));

        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(auth.getPrincipal()).isSameAs(user);
    }

    @Test
    void principalStaysJwtWithoutContextUser() {
        Jwt jwt = jwtWith(false, "alice@example.com", "authenticated", null, List.of());

        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(auth.getPrincipal()).isSameAs(jwt);
    }

    @Test
    void ignoresContextUserForDifferentSubject() {
        Jwt jwt = jwtWith(false, "alice@example.com", "authenticated", null, List.of());
        Jwt other = jwtWith(false, "bob@example.com", "authenticated", null, List.of());
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new EnhancedJwtAuthenticationToken(
                                other,
                                List.of(),
                                "bob@example.com",
                                other.getSubject(),
                                new User()));

        AbstractAuthenticationToken auth = SupabaseSecurityConfig.toAuthentication(jwt);

        assertThat(auth.getPrincipal()).isSameAs(jwt);
    }

    private static Jwt jwtWith(
            boolean anonymous,
            String email,
            String supabaseRole,
            String appRole,
            List<String> perms) {
        UUID sub = UUID.randomUUID();
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", sub.toString());
        claims.put("is_anonymous", anonymous);
        if (email != null) {
            claims.put("email", email);
        }
        if (supabaseRole != null) {
            claims.put("role", supabaseRole);
        }
        if (appRole != null) {
            claims.put("app_role", appRole);
        }
        if (perms != null) {
            claims.put("permissions", perms);
        }
        return new Jwt(
                "tok",
                Instant.now(),
                Instant.now().plusSeconds(60),
                Map.of("alg", "HS256"),
                claims);
    }

    private static List<String> authorityNames(AbstractAuthenticationToken auth) {
        return auth.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    }

    // ---------- SupabaseTokenValidator (iss / exp / aud / clock-skew) ----------

    private static final String ISSUER = "https://qacaivhsjtftfwtgjvva.supabase.co/auth/v1";
    private static final Duration SKEW = Duration.ofSeconds(120);

    @Test
    void validatorAcceptsTokenWithMatchingIssuerAndFutureExp() {
        Jwt jwt = jwtForValidator(ISSUER, Instant.now().plusSeconds(600), List.of("authenticated"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void validatorRejectsTokenWithWrongIssuer() {
        Jwt jwt =
                jwtForValidator(
                        "https://different-project.supabase.co/auth/v1",
                        Instant.now().plusSeconds(600),
                        List.of("authenticated"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).anyMatch(e -> e.getDescription().contains("Invalid issuer"));
    }

    @Test
    void validatorRejectsExpiredTokenBeyondSkew() {
        // Expired 600 seconds ago, skew is only 120s -> rejected.
        Jwt jwt =
                jwtForValidator(ISSUER, Instant.now().minusSeconds(600), List.of("authenticated"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).anyMatch(e -> e.getDescription().contains("Token expired"));
    }

    @Test
    void validatorAcceptsExpiredTokenInsideSkew() {
        // Expired 30 seconds ago but skew is 120s -> still accepted.
        Jwt jwt = jwtForValidator(ISSUER, Instant.now().minusSeconds(30), List.of("authenticated"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void validatorRejectsMissingExpClaim() {
        Jwt jwt = jwtForValidator(ISSUER, null, List.of("authenticated"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).anyMatch(e -> e.getDescription().contains("Missing exp"));
    }

    @Test
    void validatorEnforcesAudienceWhenConfigured() {
        Jwt good =
                jwtForValidator(ISSUER, Instant.now().plusSeconds(600), List.of("authenticated"));
        Jwt bad = jwtForValidator(ISSUER, Instant.now().plusSeconds(600), List.of("wrong"));

        OAuth2TokenValidatorResult ok =
                new SupabaseTokenValidator(ISSUER, "authenticated", SKEW).validate(good);
        OAuth2TokenValidatorResult fail =
                new SupabaseTokenValidator(ISSUER, "authenticated", SKEW).validate(bad);

        assertThat(ok.hasErrors()).isFalse();
        assertThat(fail.hasErrors()).isTrue();
        assertThat(fail.getErrors())
                .anyMatch(e -> e.getDescription().contains("Missing/invalid audience"));
    }

    @Test
    void validatorSkipsAudienceWhenNotConfigured() {
        Jwt jwt = jwtForValidator(ISSUER, Instant.now().plusSeconds(600), List.of("anything"));
        // expectedAud=null means aud claim is not checked.
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, null, SKEW).validate(jwt);
        assertThat(result.hasErrors()).isFalse();
    }

    @Test
    void validatorSkipsAudienceWhenBlankString() {
        Jwt jwt = jwtForValidator(ISSUER, Instant.now().plusSeconds(600), List.of("anything"));
        OAuth2TokenValidatorResult result =
                new SupabaseTokenValidator(ISSUER, "   ", SKEW).validate(jwt);
        assertThat(result.hasErrors()).isFalse();
    }

    private static Jwt jwtForValidator(String issuer, Instant expiresAt, List<String> aud) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("iss", issuer);
        claims.put("sub", UUID.randomUUID().toString());
        if (aud != null) {
            claims.put("aud", aud);
        }
        // Spring's Jwt constructor enforces issuedAt < expiresAt. For expired-token
        // test cases (where expiresAt is in the past), anchor issuedAt 60s before
        // expiresAt; for the missing-exp case both are null.
        Instant issuedAt = (expiresAt == null) ? null : expiresAt.minusSeconds(60);
        return new Jwt("tok", issuedAt, expiresAt, Map.of("alg", "HS256"), claims);
    }
}
