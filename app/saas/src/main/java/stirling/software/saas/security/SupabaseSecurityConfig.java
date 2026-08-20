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
import stirling.software.common.security.Authentication;
import stirling.software.common.security.GrantedAuthority;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.common.security.SimpleGrantedAuthority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.ApiKeyAuthenticationService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.service.SaasTeamService;
import stirling.software.saas.service.SupabaseUserService;

/** Stateless Supabase-JWT security chain. */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class SupabaseSecurityConfig {

    private final UserService userService;
    private final TeamService teamService;
    private final SupabaseUserService supabaseUserService;
    private final SaasTeamService saasTeamService;
    private final ApplicationProperties applicationProperties;
    private final ApiKeyAuthenticationService apiKeyAuthenticationService;

    @ConfigProperty(name = "app.supabase.issuer", defaultValue = "")
    String issuer;

    /** Optional audience claim to enforce. Empty means do not validate the {@code aud} claim. */
    @ConfigProperty(name = "app.supabase.expected-aud", defaultValue = "")
    String expectedAud;

    /** Clock skew tolerance (seconds) applied to the {@code exp} claim. */
    @ConfigProperty(name = "app.supabase.clock-skew-seconds", defaultValue = "120")
    long clockSkewSeconds;

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

    List<String> resolveCorsOrigins() {
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
        // Always allow the desktop (Tauri) app's webview origins so the bundled desktop client can
        // reach the cloud backend regardless of the operator's configured web origins. A browser
        // can
        // never present a tauri:// (or tauri.localhost) origin, so these are desktop-app identities
        // -
        // safe to allow alongside allowCredentials=true. Mirrors core WebMvcConfig.
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
        // Carry the resolved User (built by SupabaseAuthenticationFilter) across so
        // instanceof-User authorization keeps working when this token is rebuilt.
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
