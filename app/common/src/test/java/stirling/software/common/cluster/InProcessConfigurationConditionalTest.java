package stirling.software.common.cluster;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.context.PropertyPlaceholderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.common.cluster.inprocess.InProcessClusterConfiguration;
import stirling.software.common.model.ApplicationProperties;

/**
 * Verifies the {@link InProcessClusterConfiguration} conditional wiring: in-process beans wire when
 * cluster mode is off or {@code backplane=inprocess}, and are skipped when {@code
 * backplane=valkey}.
 */
class InProcessConfigurationConditionalTest {

    private final ApplicationContextRunner runner =
            new ApplicationContextRunner()
                    .withConfiguration(
                            org.springframework.boot.autoconfigure.AutoConfigurations.of(
                                    PropertyPlaceholderAutoConfiguration.class))
                    .withUserConfiguration(
                            TestAppPropertiesConfig.class,
                            ClusterConfig.class,
                            InProcessClusterConfiguration.class);

    @Test
    void inProcessBeansWireWhenClusterDisabled() {
        runner.run(
                context ->
                        assertThat(context)
                                .hasNotFailed()
                                .hasSingleBean(ClusterBackplane.class)
                                .hasSingleBean(JobStore.class)
                                .hasSingleBean(RateLimitStore.class)
                                .hasSingleBean(DistributedLock.class)
                                .hasSingleBean(KeyValueCache.class)
                                .hasSingleBean(InstanceRegistry.class));
    }

    @Test
    void inProcessBeansWireWhenEnabledWithInProcessBackplane() {
        runner.withPropertyValues("cluster.enabled=true", "cluster.backplane=inprocess")
                .run(
                        context ->
                                assertThat(context)
                                        .hasNotFailed()
                                        .hasSingleBean(ClusterBackplane.class)
                                        .hasSingleBean(JobStore.class)
                                        .hasSingleBean(RateLimitStore.class)
                                        .hasSingleBean(DistributedLock.class)
                                        .hasSingleBean(KeyValueCache.class)
                                        .hasSingleBean(InstanceRegistry.class));
    }

    @Test
    void inProcessBeansSkippedWhenEnabledWithDistributedBackplane() {
        runner.withPropertyValues(
                        "cluster.enabled=true",
                        "cluster.backplane=valkey",
                        "cluster.valkey.url=redis://localhost:6379")
                .run(
                        context ->
                                assertThat(context)
                                        .hasNotFailed()
                                        .doesNotHaveBean(ClusterBackplane.class)
                                        .doesNotHaveBean(JobStore.class)
                                        .doesNotHaveBean(RateLimitStore.class)
                                        .doesNotHaveBean(DistributedLock.class)
                                        .doesNotHaveBean(KeyValueCache.class)
                                        .doesNotHaveBean(InstanceRegistry.class));
    }

    /**
     * Hand-rolled {@link ApplicationProperties} bean: the production class loads YAML at startup
     * via a {@code @PostConstruct} hook that isn't appropriate for the slice runner, so we wire a
     * defaults-only instance here.
     */
    @Configuration
    static class TestAppPropertiesConfig {
        @Bean
        ApplicationProperties applicationProperties() {
            return new ApplicationProperties();
        }
    }
}
