package stirling.software.saas.security;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.jwt.JsonWebToken;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.security.AbstractAuthenticationToken;
import stirling.software.common.security.GrantedAuthority;
import stirling.software.common.security.SimpleGrantedAuthority;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

/**
 * Stateless Supabase-JWT security chain.
 *
 * <p>// TODO: Migration required - this class was a Spring {@code @Configuration} with
 * {@code @EnableWebSecurity}, {@code @EnableMethodSecurity}, {@code @Profile("saas")} and
 * {@code @Order(1)}. The {@code SecurityFilterChain} bean (CSRF/CORS/session/oauth2ResourceServer
 * wiring) has no Quarkus equivalent and must be re-expressed declaratively via {@code
 * quarkus.http.auth.*} config plus Quarkus OIDC/SmallRye-JWT. The {@code SecurityFilterChain} bean
 * method has been removed; the JWKS issuer/audience/clock-skew validation logic and the
 * CORS/authority-mapping helpers are retained below so the policy can be re-applied during native
 * security wiring. The {@code JwtDecoder}/{@code NimbusJwtDecoder}/{@code OAuth2TokenValidator}
 * Spring OAuth2 resource-server types are not available; the token decoding/validation must move to
 * Quarkus OIDC.
 */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class SupabaseSecurityConfig {

    private final UserService userService;
    private final TeamService teamService;
    private final SupabaseUserService supabaseUserService;
    private final CreditService creditService;
    private final SaasTeamService saasTeamService;
    private final ApplicationProperties applicationProperties;

    @ConfigProperty(name = "app.supabase.issuer", defaultValue = "")
    String issuer;

    /** Optional audience claim to enforce. Empty means do not validate the {@code aud} claim. */
    @ConfigProperty(name = "app.supabase.expected-aud", defaultValue = "")
    String expectedAud;

    /** Clock skew tolerance (seconds) applied to the {@code exp} claim. */
    @ConfigProperty(name = "app.supabase.clock-skew-seconds", defaultValue = "120")
    long clockSkewSeconds;

    // TODO: Migration required - the original @Bean SecurityFilterChain
    // saasSecurityFilterChain(...)
    // configured CSRF-disabled, CORS, STATELESS sessions, permitAll matchers for
    // OPTIONS/actuator-health/config/static/public-auth/frontend routes,
    // anyRequest().authenticated(),
    // registered SupabaseAuthenticationFilter before BearerTokenAuthenticationFilter, set a
    // BearerTokenAuthenticationEntryPoint + BearerTokenAccessDeniedHandler, and wired
    // oauth2ResourceServer().jwt() with this JwtDecoder and
    // SupabaseSecurityConfig::toAuthentication.
    // Re-express this via quarkus.http.auth.permission.* + quarkus.http.cors.* config and Quarkus
    // OIDC (mp.jwt). SupabaseAuthenticationFilter must be registered as a JAX-RS @Provider filter.

    // TODO: Migration required - original @Bean JwtDecoder jwtDecoder() built a NimbusJwtDecoder
    // from
    // the Supabase JWKS endpoint (issuer + "/.well-known/jwks.json") and attached a
    // SupabaseTokenValidator (iss/exp/aud enforcement with clock skew), failing closed when the
    // issuer was unusable. NimbusJwtDecoder / JwtDecoder are Spring OAuth2 types with no Quarkus
    // equivalent; configure Quarkus OIDC (quarkus.oidc.auth-server-url / mp.jwt.verify.* ) to point
    // at the Supabase JWKS instead. The issuer validation helper below is retained for reuse.

    /** Returns {@code null} if the issuer URL is usable, otherwise a short reason string. */
    static String validateIssuer(String issuer) {
        if (issuer == null || issuer.isBlank()) {
            return "app.supabase.issuer is not set;";
        }
        URI uri;
        try {
            uri = new URI(issuer);
        } catch (URISyntaxException e) {
            return "app.supabase.issuer is not a valid URI (" + issuer + ");";
        }
        String host = uri.getHost();
        if (host == null || host.isBlank() || host.startsWith(".")) {
            return "app.supabase.issuer has an empty host ("
                    + issuer
                    + "); likely SAAS_DB_PROJECT_REF is unset;";
        }
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            return "app.supabase.issuer must be http(s) (" + issuer + ");";
        }
        return null;
    }

    /**
     * Validates iss, exp (with clock-skew) and optionally aud on a decoded Supabase JWT.
     *
     * <p>// TODO: Migration required - originally implemented Spring's {@code
     * OAuth2TokenValidator<Jwt>} and returned {@code OAuth2TokenValidatorResult}. Those Spring
     * OAuth2 types are gone; the validation now operates on {@link JsonWebToken} and returns the
     * list of error messages (empty == valid). Re-wire this into Quarkus OIDC token validation.
     */
    static final class SupabaseTokenValidator {
        private final String expectedIssuer;
        private final String expectedAudienceOrNull;
        private final Duration skew;

        SupabaseTokenValidator(
                String expectedIssuer, String expectedAudienceOrNull, Duration skew) {
            this.expectedIssuer = Objects.requireNonNull(expectedIssuer, "expectedIssuer");
            this.expectedAudienceOrNull =
                    (expectedAudienceOrNull != null && !expectedAudienceOrNull.isBlank())
                            ? expectedAudienceOrNull
                            : null;
            this.skew = Objects.requireNonNull(skew, "skew");
        }

        List<String> validate(JsonWebToken token) {
            List<String> errors = new ArrayList<>();

            String iss = token.getIssuer();
            if (iss == null || !iss.equals(expectedIssuer)) {
                errors.add("Invalid issuer: " + iss);
            }

            long expSeconds = token.getExpirationTime();
            if (expSeconds <= 0) {
                errors.add("Missing exp claim");
            } else {
                Instant exp = Instant.ofEpochSecond(expSeconds);
                if (exp.isBefore(Instant.now().minus(skew))) {
                    errors.add("Token expired at " + exp);
                }
            }

            if (expectedAudienceOrNull != null) {
                java.util.Set<String> aud = token.getAudience();
                if (aud == null || !aud.contains(expectedAudienceOrNull)) {
                    errors.add("Missing/invalid audience: " + expectedAudienceOrNull);
                }
            }

            return errors;
        }
    }

    // TODO: Migration required - original @Bean CorsConfigurationSource configured CORS for the
    // Spring SecurityFilterChain (allowed origins/methods/headers, exposed headers
    // WWW-Authenticate + X-Credits-Remaining, allowCredentials=true, maxAge=3600). Re-express via
    // quarkus.http.cors.* properties. The origin-resolution logic (operator override vs. defaults
    // and wildcard warning) is retained below as a helper for that translation.
    List<String> resolveCorsOrigins() {
        boolean operatorOverride =
                applicationProperties.getSystem() != null
                        && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                        && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty();
        List<String> origins =
                operatorOverride
                        ? applicationProperties.getSystem().getCorsAllowedOrigins()
                        : List.of(
                                "http://localhost:3000",
                                "http://localhost:5173",
                                "http://localhost:8080",
                                "https://stirling.com",
                                "https://app.stirling.com",
                                "https://api.stirling.com");
        if (origins.stream().anyMatch(o -> o.contains("*"))) {
            log.warn(
                    "CORS origins contain a wildcard paired with allowCredentials=true: {}."
                            + " Wildcard subdomains can be taken over by an attacker (lapsed DNS,"
                            + " abandoned vhost) and would receive credentialed responses. Pin to"
                            + " specific hostnames.",
                    origins);
        }
        return origins;
    }

    /**
     * Maps Supabase JWT claims onto authorities. Package-private static so unit tests can call it
     * directly without instantiating the full security config.
     */
    static AbstractAuthenticationToken toAuthentication(JsonWebToken jwt) {
        List<GrantedAuthority> authorities = new ArrayList<>();

        // Transient (non-persisted) authorities for the JWT principal. Use
        // SimpleGrantedAuthority rather than the @Entity Authority class.
        boolean isAnonymous = Boolean.TRUE.equals(jwt.<Boolean>getClaim("is_anonymous"));
        String supabaseRole = jwt.getClaim("role");
        if (supabaseRole != null && !supabaseRole.isBlank()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + supabaseRole));
        }
        String appRole = jwt.getClaim("app_role");
        if (appRole != null && !appRole.isBlank()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + appRole.toUpperCase(Locale.ROOT)));
        }
        authorities.add(
                new SimpleGrantedAuthority(isAnonymous ? "ROLE_LIMITED_API_USER" : "ROLE_USER"));

        List<String> perms = jwt.getClaim("permissions");
        if (perms != null) {
            perms.stream()
                    .filter(p -> p != null && !p.isBlank())
                    .map(p -> new SimpleGrantedAuthority("PERM_" + p))
                    .forEach(authorities::add);
        }

        String email = jwt.getClaim("email");
        String supabaseId = jwt.getSubject();
        if (log.isDebugEnabled()) {
            log.debug(
                    "JWT accepted: email='{}', supabaseId='{}', authorities='{}'",
                    email,
                    supabaseId,
                    authorities.stream()
                            .map(GrantedAuthority::getAuthority)
                            .collect(Collectors.joining(",")));
        }
        return new EnhancedJwtAuthenticationToken(jwt, authorities, email, supabaseId);
    }
}
