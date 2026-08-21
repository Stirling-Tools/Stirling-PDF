package stirling.software.proprietary.security.configuration.ee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class EEAppConfigTest {

    @Test
    void ssoAutoLogin_disabled_returnsFalse_andDoesNotConsultLicense() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().getProFeatures().setSsoAutoLogin(false);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);

        EEAppConfig cfg = new EEAppConfig(props, checker);

        assertThat(cfg.ssoAutoLogin()).isFalse();
        verifyNoInteractions(checker);
    }

    @Test
    void ssoAutoLogin_enabled_withProLicense_returnsTrue() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().getProFeatures().setSsoAutoLogin(true);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        when(checker.getPremiumLicenseEnabledResult())
                .thenReturn(KeygenLicenseVerifier.License.SERVER);

        EEAppConfig cfg = new EEAppConfig(props, checker);

        assertThat(cfg.ssoAutoLogin()).isTrue();
    }

    @Test
    void ssoAutoLogin_enabled_withoutLicense_throwsAtBootTime() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().getProFeatures().setSsoAutoLogin(true);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);
        // Real LicenseKeyChecker.requireProOrEnterprise throws on NORMAL; mock that behavior here.
        org.mockito.Mockito.doThrow(
                        new IllegalStateException(
                                "premium.proFeatures.ssoAutoLogin=true requires a Pro or Enterprise license"))
                .when(checker)
                .requireProOrEnterprise("premium.proFeatures.ssoAutoLogin=true");

        EEAppConfig cfg = new EEAppConfig(props, checker);

        assertThatThrownBy(cfg::ssoAutoLogin)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(
                        "premium.proFeatures.ssoAutoLogin=true requires a Pro or Enterprise license");
    }
}
