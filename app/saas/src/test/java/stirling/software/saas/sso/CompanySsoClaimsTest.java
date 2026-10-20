package stirling.software.saas.sso;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class CompanySsoClaimsTest {
    @Test
    void readsProviderAfterMfaAndRejectsMetadataAsProof() {
        UUID provider = UUID.randomUUID();
        Instant now = Instant.now();
        Jwt jwt =
                token(
                        List.of(
                                Map.of("method", "totp", "timestamp", now.getEpochSecond()),
                                Map.of(
                                        "method",
                                        "sso/saml",
                                        "provider",
                                        provider.toString(),
                                        "timestamp",
                                        now.getEpochSecond())));
        assertThat(CompanySsoClaims.saml(jwt).orElseThrow().providerId()).isEqualTo(provider);
        assertThat(
                        CompanySsoClaims.saml(
                                token(
                                        List.of(
                                                Map.of(
                                                        "method",
                                                        "oauth",
                                                        "timestamp",
                                                        now.getEpochSecond())))))
                .isEmpty();
    }

    @Test
    void missingOrMalformedProviderStillIdentifiesSamlButCannotAdmitIt() {
        for (String provider : List.of("", "sso:untrusted", "not-a-uuid")) {
            Jwt jwt =
                    token(
                            List.of(
                                    Map.of(
                                            "method",
                                            "sso/saml",
                                            "provider",
                                            provider,
                                            "timestamp",
                                            1)));
            assertThat(CompanySsoClaims.isSaml(jwt)).isTrue();
            assertThat(CompanySsoClaims.saml(jwt)).isEmpty();
        }
    }

    @Test
    void refreshAndRecentMfaDoNotRenewOldPrimaryProof() {
        Instant now = Instant.now();
        assertThat(
                        CompanySsoClaims.hasRecentPrimaryLogin(
                                token(
                                        List.of(
                                                Map.of(
                                                        "method",
                                                        "password",
                                                        "timestamp",
                                                        now.minusSeconds(600).getEpochSecond()),
                                                Map.of(
                                                        "method",
                                                        "totp",
                                                        "timestamp",
                                                        now.getEpochSecond()),
                                                Map.of(
                                                        "method",
                                                        "token_refresh",
                                                        "timestamp",
                                                        now.getEpochSecond()))),
                                now))
                .isFalse();
        assertThat(
                        CompanySsoClaims.hasRecentPrimaryLogin(
                                token(
                                        List.of(
                                                Map.of(
                                                        "method",
                                                        "password",
                                                        "timestamp",
                                                        now.plusSeconds(60).getEpochSecond()))),
                                now))
                .isFalse();
        assertThat(
                        CompanySsoClaims.hasRecentPrimaryLogin(
                                token(
                                        List.of(
                                                Map.of(
                                                        "method",
                                                        "password",
                                                        "timestamp",
                                                        now.getEpochSecond()))),
                                now))
                .isTrue();
    }

    private Jwt token(Object amr) {
        return Jwt.withTokenValue("test")
                .header("alg", "RS256")
                .subject(UUID.randomUUID().toString())
                .claim("amr", amr)
                .claim("app_metadata", Map.of("provider", "sso:claimed-provider"))
                .build();
    }
}
