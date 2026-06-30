package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link SaasLicenseOverride}.
 *
 * <p>Saas mode is unconditionally enterprise. These bean methods are the source of truth for the
 * {@code runningProOrHigher}, {@code license}, and {@code runningEE} beans, so a regression would
 * silently downgrade every tenant's feature set.
 */
class SaasLicenseOverrideTest {

    private final SaasLicenseOverride override = new SaasLicenseOverride();

    @Test
    @DisplayName("runningProOrHigher bean is true")
    void runningProOrHigher() {
        assertThat(override.runningProOrHigherSaas()).isTrue();
    }

    @Test
    @DisplayName("license bean is ENTERPRISE")
    void license() {
        assertThat(override.licenseTypeSaas()).isEqualTo("ENTERPRISE");
    }

    @Test
    @DisplayName("runningEE bean is true")
    void runningEnterprise() {
        assertThat(override.runningEnterpriseSaas()).isTrue();
    }
}
