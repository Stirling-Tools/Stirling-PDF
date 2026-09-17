package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.DynamicLicenseService;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

class SaasLicenseBeanCoverageTest {
    @Test
    void saasResolvesBothDynamicAndStartupInfrastructureEntitlements() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("saas");
            context.register(SaasLicenseOverride.class);
            context.refresh();
            LicenseServiceInterface license = context.getBean(LicenseServiceInterface.class);
            assertThat(license.isRunningProOrHigher()).isTrue();
            assertThat(license.isRunningEE()).isTrue();
            assertThat(context.getBean("runningProOrHigher")).isEqualTo(true);
            assertThat(context.getBean("runningEE")).isEqualTo(true);
        }
    }

    // :saas ships :proprietary, so the licence gates see two candidates and only @Primary
    // keeps every tenant Enterprise instead of falling back to the unlicensed dynamic tier.
    @Test
    void saasOverrideOutranksTheProprietaryLicenceService() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("saas");
            context.registerBean(LicenseKeyChecker.class, () -> mock(LicenseKeyChecker.class));
            context.register(SaasLicenseOverride.class, DynamicLicenseService.class);
            context.refresh();
            assertThat(context.getBeanNamesForType(LicenseServiceInterface.class)).hasSize(2);
            LicenseServiceInterface license = context.getBean(LicenseServiceInterface.class);
            assertThat(license).isInstanceOf(SaasLicenseOverride.class);
            assertThat(license.isRunningProOrHigher()).isTrue();
            assertThat(license.isRunningEE()).isTrue();
        }
    }
}
