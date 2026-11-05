package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

/**
 * A stock install sets no metering property, so the bean condition and the bound default have to
 * agree on "on" by themselves: the meter accrues and the sync reports, or linked usage goes
 * unbilled.
 */
class UsageMeterServiceConditionTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withBean(
                            UsageCounterRepository.class, () -> mock(UsageCounterRepository.class))
                    .withBean(
                            MeteredInputSignatureRepository.class,
                            () -> mock(MeteredInputSignatureRepository.class))
                    .withUserConfiguration(BoundProperties.class, UsageMeterService.class);

    @Test
    void metersWhenThePropertyIsAbsent() {
        runner.run(
                context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(UsageMeterService.class);
                    assertThat(
                                    context.getBean(AccountLinkProperties.class)
                                            .getMetering()
                                            .isEnabled())
                            .isTrue();
                });
    }

    @Test
    void turnsOffTogether() {
        runner.withPropertyValues("stirling.billing.account-link.metering.enabled=false")
                .run(
                        context -> {
                            assertThat(context)
                                    .hasNotFailed()
                                    .doesNotHaveBean(UsageMeterService.class);
                            assertThat(
                                            context.getBean(AccountLinkProperties.class)
                                                    .getMetering()
                                                    .isEnabled())
                                    .isFalse();
                        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AccountLinkProperties.class)
    static class BoundProperties {}
}
