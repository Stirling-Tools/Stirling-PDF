package stirling.software.proprietary.security.configuration.ee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

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
    void ssoAutoLogin_enabled_returnsTrue_withoutConsultingLicense() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().getProFeatures().setSsoAutoLogin(true);
        LicenseKeyChecker checker = mock(LicenseKeyChecker.class);

        EEAppConfig cfg = new EEAppConfig(props, checker);

        assertThat(cfg.ssoAutoLogin()).isTrue();
        verifyNoInteractions(checker);
    }
}
