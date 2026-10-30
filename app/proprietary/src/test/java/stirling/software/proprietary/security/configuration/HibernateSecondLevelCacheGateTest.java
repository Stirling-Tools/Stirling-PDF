package stirling.software.proprietary.security.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

/**
 * Pins the second-level cache gate: the process-local regions cannot be invalidated across nodes,
 * so a clustered deployment must stand the cache down, and a multi-instance deployment that does
 * not use cluster mode yet must be able to rule it out explicitly.
 */
class HibernateSecondLevelCacheGateTest {

    private static Map<String, Object> customize(ApplicationProperties properties) {
        Map<String, Object> hibernateProperties = new HashMap<>();
        new CacheConfig(properties).hibernateSecondLevelCacheGate().customize(hibernateProperties);
        return hibernateProperties;
    }

    @Test
    void disablesSecondLevelCacheWhenClusterIsEnabled() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getCluster().setEnabled(true);

        assertThat(customize(properties))
                .containsEntry("hibernate.cache.use_second_level_cache", false)
                .containsEntry("jakarta.persistence.sharedCache.mode", "NONE");
    }

    @Test
    void disablesSecondLevelCacheWhenTurnedOffExplicitly() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecondLevelCache().setEnabled(false);

        assertThat(customize(properties))
                .containsEntry("hibernate.cache.use_second_level_cache", false)
                .containsEntry("jakarta.persistence.sharedCache.mode", "NONE");
    }

    @Test
    void clusterModeWinsWhenSecondLevelCacheIsTurnedOnExplicitly() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getCluster().setEnabled(true);
        properties.getSecondLevelCache().setEnabled(true);

        assertThat(customize(properties))
                .containsEntry("hibernate.cache.use_second_level_cache", false);
    }

    @Test
    void leavesSecondLevelCacheAloneForSingleNodeDeployments() {
        ApplicationProperties properties = new ApplicationProperties();

        assertThat(customize(properties)).isEmpty();
    }
}
