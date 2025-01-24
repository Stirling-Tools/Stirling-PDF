package stirling.software.SPDF.EE;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;

@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
@Slf4j
public class EEAppConfig {

    private final ApplicationProperties applicationProperties;

    private final LicenseKeyChecker licenseKeyChecker;

    public EEAppConfig(
            ApplicationProperties applicationProperties, LicenseKeyChecker licenseKeyChecker) {
        this.applicationProperties = applicationProperties;
        this.licenseKeyChecker = licenseKeyChecker;
    }

    @Bean(name = "runningEE")
    public boolean runningEnterpriseEdition() {
        return licenseKeyChecker.getEnterpriseEnabledResult();
    }

    @Bean(name = "SSOAutoLogin")
    public boolean ssoAutoLogin() {
        return applicationProperties.getEnterpriseEdition().isSsoAutoLogin();
    }
}
