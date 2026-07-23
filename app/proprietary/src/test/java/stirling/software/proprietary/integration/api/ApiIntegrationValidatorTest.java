package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

/**
 * The private-endpoint opt-in is coarse by design (it lets an on-prem integration reach RFC1918),
 * but it must never open the cloud metadata service - the one internal address whose only use is
 * stealing the instance's credentials.
 */
class ApiIntegrationValidatorTest {

    private final ApiIntegrationValidator validator =
            new ApiIntegrationValidator(properties(false));

    private static ApplicationProperties properties(boolean allowPrivate) {
        ApplicationProperties p = new ApplicationProperties();
        p.getPolicies().setAllowPrivateApiEndpoints(allowPrivate);
        return p;
    }

    private static Map<String, Object> config(String baseUrl) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("baseUrl", baseUrl);
        return c;
    }

    @Test
    void acceptsAnOrdinaryPublicHost() {
        // A public IP literal, so the check needs no network DNS (an unresolvable name would fail
        // closed at the resolve step, which is correct but not what this test is about).
        assertThatCode(() -> validator.validate(config("https://1.1.1.1/v1")))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsAPrivateHostByDefault() {
        assertThatThrownBy(() -> validator.validate(config("http://10.0.0.5/x")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsTheCloudMetadataAddressEvenWithThePrivateOptInOn() {
        ApiIntegrationValidator opted = new ApiIntegrationValidator(properties(true));

        // The on-prem opt-in allows RFC1918, but the metadata endpoint stays blocked.
        assertThatThrownBy(() -> opted.validate(config("http://169.254.169.254/latest/meta-data/")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("metadata service");
    }

    @Test
    void aPrivateOnPremHostIsAllowedWhenOptedIn() {
        ApiIntegrationValidator opted = new ApiIntegrationValidator(properties(true));

        assertThatCode(() -> opted.validate(config("http://10.10.0.20:8080/api")))
                .doesNotThrowAnyException();
    }

    @Test
    void theMetadataBlockRunsBeforeTheOptInSoItCannotBeBypassed() {
        // Also covers the Oracle/IBM variants that share the 169.254.169.x range.
        ApiIntegrationValidator opted = new ApiIntegrationValidator(properties(true));

        assertThatThrownBy(() -> opted.validate(config("http://169.254.169.253/")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("metadata service");
    }
}
