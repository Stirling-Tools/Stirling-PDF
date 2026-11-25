package stirling.software.saas.sso;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

/** Reads signed session AMR, never account metadata or a client's claimed provider. */
public final class CompanySsoClaims {
    private CompanySsoClaims() {}

    public record SamlLogin(UUID providerId, Instant authenticatedAt) {}

    /** Missing provider evidence fails closed, including older Supabase deployments. */
    public static Optional<SamlLogin> saml(Jwt jwt) {
        Object claim = jwt.getClaims().get("amr");
        if (!(claim instanceof List<?> methods)) return Optional.empty();
        for (Object item : methods) {
            if (item instanceof Map<?, ?> method && "sso/saml".equals(method.get("method"))) {
                try {
                    if (!(method.get("timestamp") instanceof Number timestamp)) break;
                    return Optional.of(
                            new SamlLogin(
                                    UUID.fromString(String.valueOf(method.get("provider"))),
                                    Instant.ofEpochSecond(timestamp.longValue())));
                } catch (IllegalArgumentException ignored) {
                    break;
                }
            }
        }
        return Optional.empty();
    }

    /** Recognises SAML even when a malformed AMR prevents determining the provider. */
    public static boolean isSaml(Jwt jwt) {
        Object claim = jwt.getClaims().get("amr");
        return claim instanceof List<?> methods
                && methods.stream()
                        .anyMatch(
                                item ->
                                        item instanceof Map<?, ?> method
                                                && "sso/saml".equals(method.get("method")));
    }

    /** Token refresh and MFA alone do not prove a fresh primary sign-in. */
    public static boolean hasRecentPrimaryLogin(Jwt jwt, Instant now) {
        Object claim = jwt.getClaims().get("amr");
        if (!(claim instanceof List<?> methods)) return false;
        return methods.stream()
                .anyMatch(
                        item -> {
                            if (!(item instanceof Map<?, ?> method)
                                    || !(method.get("timestamp") instanceof Number time)
                                    || !List.of("password", "otp", "oauth", "sso/saml")
                                            .contains(method.get("method"))) return false;
                            Instant at = Instant.ofEpochSecond(time.longValue());
                            return !at.isAfter(now.plusSeconds(5))
                                    && !at.isBefore(now.minus(Duration.ofMinutes(5)));
                        });
    }
}
