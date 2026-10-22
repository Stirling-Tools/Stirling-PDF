package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import stirling.software.common.service.LicenseServiceInterface;

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
}
