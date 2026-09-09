package stirling.software.saas.procurement.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Keygen credentials + policy for issuing enterprise procurement licences directly from Java.
 * Prefix {@code stirling.keygen}. All secrets come from the environment (relaxed binding: {@code
 * STIRLING_KEYGEN_ACCOUNT_ID}, {@code STIRLING_KEYGEN_API_TOKEN}, …) — never committed.
 *
 * <p>{@code enabled} is the switch between {@code MockEnterpriseLicenseService} (default) and the
 * real {@code KeygenEnterpriseLicenseService}; the mock stays in place until the env vars are
 * wired.
 */
@Getter
@Setter
@Component
@Profile("saas")
@ConfigurationProperties(prefix = "stirling.keygen")
public class KeygenConfigurationProperties {

    /** Master switch: when true, the real Keygen client replaces the mock licence service. */
    private boolean enabled = false;

    /** Keygen account id (UUID or slug). From {@code STIRLING_KEYGEN_ACCOUNT_ID}. */
    private String accountId;

    /** Keygen admin API token. From {@code STIRLING_KEYGEN_API_TOKEN}. Never log this. */
    private String apiToken;

    /** Policy the committed-enterprise licences are created under. From {@code ..._POLICY_ID}. */
    private String policyId;

    /** API base; overridable for self-hosted Keygen, defaults to the hosted service. */
    private String apiBase = "https://api.keygen.sh/v1";

    /**
     * License-file check-out algorithm. Must stay {@code base64+ed25519} — the self-hosted {@code
     * KeygenLicenseVerifier} only verifies that scheme (signed, unencrypted) offline.
     */
    private String licenseFileAlgorithm = "base64+ed25519";

    /** True when the credentials needed to talk to Keygen are all present. */
    public boolean isConfigured() {
        return notBlank(accountId) && notBlank(apiToken) && notBlank(policyId);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
