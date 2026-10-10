package stirling.software.proprietary.security.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

/**
 * Pins the cluster gate on the Hibernate second-level cache: process-local Caffeine regions go
 * stale across nodes, so a clustered deployment must stand the cache down instead of authorizing
 * against entries another node wrote.
 */
class HibernateSecondLevelCacheClusterGateTest {

    @Test
    void disablesSecondLevelCacheWhenClusterIsEnabled() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getCluster().setEnabled(true);

        Map<String, Object> hibernateProperties = new HashMap<>();
        new CacheConfig(properties)
                .hibernateSecondLevelCacheClusterGate()
                .customize(hibernateProperties);

        assertThat(hibernateProperties)
                .containsEntry("hibernate.cache.use_second_level_cache", false)
                .containsEntry("jakarta.persistence.sharedCache.mode", "NONE");
    }

    @Test
    void leavesSecondLevelCacheAloneForSingleNodeDeployments() {
        ApplicationProperties properties = new ApplicationProperties();

        Map<String, Object> hibernateProperties = new HashMap<>();
        new CacheConfig(properties)
                .hibernateSecondLevelCacheClusterGate()
                .customize(hibernateProperties);

        assertThat(hibernateProperties).isEmpty();
    }
}
