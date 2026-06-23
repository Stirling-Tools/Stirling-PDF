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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.RequestUriUtils;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

/** Stateless Supabase-JWT security chain. */
@Slf4j
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@Profile("saas")
@Order(1)
@RequiredArgsConstructor
public class SupabaseSecurityConfig {

    private final UserService userService;
    private final TeamService teamService;
    private final SupabaseUserService supabaseUserService;
    private final SaasTeamService saasTeamService;
    private final ApplicationProperties applicationProperties;

    @Value("${app.supabase.issuer:}")
    private String issuer;

    /** Optional audience claim to enforce. Empty means do not validate the {@code aud} claim. */
    @Value("${app.supabase.expected-aud:}")
    private String expectedAud;

    /** Clock skew tolerance (seconds) applied to the {@code exp} claim. */
    @Value("${app.supabase.clock-skew-seconds:120}")
    private long clockSkewSeconds;

    @Bean
    SecurityFilterChain saasSecurityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder)
            throws Exception {
        // CSRF protection intentionally disabled: this chain is bearer-token only (Supabase JWT in
        // Authorization header / X-API-KEY) with SessionCreationPolicy.STATELESS, so there is no
        // cookie- or session-bound credential a cross-site request could ride on. Re-enabling CSRF
        // would require synchronizer tokens which don't make sense for a stateless JSON API.
        // lgtm[java/spring-disabled-csrf-protection]
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(
                        auth ->
                                auth.requestMatchers(HttpMethod.OPTIONS, "/**")
                                        .permitAll()
                                        .requestMatchers("/actuator/health", "/api/v1/config/**")
                                        .permitAll()
                                        .requestMatchers(
                                                req ->
                                                        RequestUriUtils.isStaticResource(
                                                                        req.getContextPath(),
                                                                        req.getRequestURI())
                                                                || RequestUriUtils
                                                                        .isPublicAuthEndpoint(
                                                                                req.getRequestURI(),
                                                                                req
                                                                                        .getContextPath())
                                                                || RequestUriUtils.isFrontendRoute(
                                                                        req.getContextPath(),
                                                                        req.getRequestURI()))
                                        .permitAll()
                                        .anyRequest()
                                        .authenticated())
                .addFilterBefore(
                        new SupabaseAuthenticationFilter(
                                teamService,
                                userService,
                                supabaseUserService,
                                saasTeamService,
                                jwtDecoder),
                        BearerTokenAuthenticationFilter.class)
                .exceptionHandling(
                        ex ->
                                ex.authenticationEntryPoint(
                                                new BearerTokenAuthenticationEntryPoint())
                                        .accessDeniedHandler(new BearerTokenAccessDeniedHandler()))
                .oauth2ResourceServer(
                        oauth ->
                                oauth.jwt(
                                        jwt ->
                                                jwt.decoder(jwtDecoder)
                                                        .jwtAuthenticationConverter(
                                                                SupabaseSecurityConfig
                                                                        ::toAuthentication)));
        return http.build();
    }

    @Bean
    JwtDecoder jwtDecoder() {
        String issuerError = validateIssuer(issuer);
        if (issuerError != null) {
            log.warn(
                    "{} saas profile is active but JWTs cannot be validated. Set SAAS_DB_PROJECT_REF"
                            + " (or app.supabase.issuer) in application-saas.properties or via env.",
                    issuerError);
            // Build a decoder that will reject every token; failing closed is safer than failing
            // open when configuration is incomplete.
            final String reason = issuerError;
            return token -> {
                throw new org.springframework.security.oauth2.jwt.JwtException(reason);
            };
        }
        String jwks = issuer + "/.well-known/jwks.json";
        log.info("Configuring JWT decoder with JWKS: {}", jwks);
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
        // Defence-in-depth: signature verification already binds the token to this Supabase
        // project's JWKS, but enforcing iss/exp/aud explicitly catches tokens that smuggle
        // through (e.g. JWKS reuse across projects, clock-skew abuse, missing aud).
        decoder.setJwtValidator(
                new SupabaseTokenValidator(
                        issuer, expectedAud, Duration.ofSeconds(clockSkewSeconds)));
        if (expectedAud == null || expectedAud.isBlank()) {
            log.info(
                    "JWT validation: enforcing issuer='{}' and exp (skew={}s); aud check disabled",
                    issuer,
                    clockSkewSeconds);
        } else {
            log.info(
                    "JWT validation: enforcing issuer='{}', aud='{}', and exp (skew={}s)",
                    issuer,
                    expectedAud,
                    clockSkewSeconds);
        }
        return decoder;
    }

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

    /** Validates iss, exp (with clock-skew) and optionally aud on a decoded Supabase JWT. */
    static final class SupabaseTokenValidator implements OAuth2TokenValidator<Jwt> {
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

        @Override
        public OAuth2TokenValidatorResult validate(Jwt token) {
            List<OAuth2Error> errors = new ArrayList<>();

            String iss = token.getIssuer() != null ? token.getIssuer().toString() : null;
            if (iss == null || !iss.equals(expectedIssuer)) {
                errors.add(new OAuth2Error("invalid_token", "Invalid issuer: " + iss, null));
            }

            Instant exp = token.getExpiresAt();
            if (exp == null) {
                errors.add(new OAuth2Error("invalid_token", "Missing exp claim", null));
            } else if (exp.isBefore(Instant.now().minus(skew))) {
                errors.add(new OAuth2Error("invalid_token", "Token expired at " + exp, null));
            }

            if (expectedAudienceOrNull != null) {
                List<String> aud = token.getAudience();
                if (aud == null || !aud.contains(expectedAudienceOrNull)) {
                    errors.add(
                            new OAuth2Error(
                                    "invalid_token",
                                    "Missing/invalid audience: " + expectedAudienceOrNull,
                                    null));
                }
            }

            return errors.isEmpty()
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(errors);
        }
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        boolean operatorOverride =
                applicationProperties.getSystem() != null
                        && applicationProperties.getSystem().getCorsAllowedOrigins() != null
                        && !applicationProperties.getSystem().getCorsAllowedOrigins().isEmpty();
        List<String> configuredOrigins =
                operatorOverride
                        ? applicationProperties.getSystem().getCorsAllowedOrigins()
                        : List.of(
                                "http://localhost:3000",
                                "http://localhost:5173",
                                "http://localhost:8080",
                                "https://stirling.com",
                                "https://app.stirling.com",
                                "https://api.stirling.com");
        // Always allow the desktop (Tauri) app's webview origins so the bundled
        // desktop client can reach the cloud backend regardless of the operator's
        // configured web origins. A browser can never present a tauri:// (or
        // tauri.localhost) origin, so these are desktop-app identities — safe to
        // allow alongside allowCredentials=true. Mirrors core WebMvcConfig.
        List<String> origins = new ArrayList<>(configuredOrigins);
        for (String desktopOrigin :
                List.of("tauri://localhost", "http://tauri.localhost", "https://tauri.localhost")) {
            if (!origins.contains(desktopOrigin)) {
                origins.add(desktopOrigin);
            }
        }
        if (origins.stream().anyMatch(o -> o.contains("*"))) {
            log.warn(
                    "CORS origins contain a wildcard paired with allowCredentials=true: {}."
                            + " Wildcard subdomains can be taken over by an attacker (lapsed DNS,"
                            + " abandoned vhost) and would receive credentialed responses. Pin to"
                            + " specific hostnames.",
                    origins);
        }
        cfg.setAllowedOriginPatterns(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(
                List.of(
                        "Authorization",
                        "Content-Type",
                        "X-Requested-With",
                        "Accept",
                        "Origin",
                        "X-API-KEY",
                        "X-Browser-Id"));
        cfg.setExposedHeaders(List.of("WWW-Authenticate"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

    /**
     * Maps Supabase JWT claims onto Spring Security authorities. Package-private static so unit
     * tests can call it directly without instantiating the full security config.
     */
    static AbstractAuthenticationToken toAuthentication(Jwt jwt) {
        List<GrantedAuthority> authorities = new ArrayList<>();

        // Transient (non-persisted) authorities for the JWT principal. Use
        // SimpleGrantedAuthority rather than the @Entity Authority class.
        boolean isAnonymous = Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous"));
        String supabaseRole = jwt.getClaimAsString("role");
        if (supabaseRole != null && !supabaseRole.isBlank()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + supabaseRole));
        }
        String appRole = jwt.getClaimAsString("app_role");
        if (appRole != null && !appRole.isBlank()) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + appRole.toUpperCase(Locale.ROOT)));
        }
        authorities.add(
                new SimpleGrantedAuthority(isAnonymous ? "ROLE_LIMITED_API_USER" : "ROLE_USER"));

        List<String> perms = jwt.getClaimAsStringList("permissions");
        if (perms != null) {
            perms.stream()
                    .filter(p -> p != null && !p.isBlank())
                    .map(p -> new SimpleGrantedAuthority("PERM_" + p))
                    .forEach(authorities::add);
        }

        String email = jwt.getClaimAsString("email");
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
        // BearerTokenAuthenticationFilter overwrites the context SupabaseAuthenticationFilter
        // built; carry its resolved User across so instanceof-User authorization keeps working.
        User user = null;
        Authentication existing = SecurityContextHolder.getContext().getAuthentication();
        if (existing instanceof EnhancedJwtAuthenticationToken enhanced
                && supabaseId != null
                && supabaseId.equals(enhanced.getSupabaseId())
                && enhanced.getPrincipal() instanceof User existingUser) {
            user = existingUser;
        }
        return new EnhancedJwtAuthenticationToken(jwt, authorities, email, supabaseId, user);
    }
}
