package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;

import javax.cache.Cache;
import javax.cache.CacheManager;
import javax.cache.Caching;
import javax.cache.configuration.CompleteConfiguration;

import org.junit.jupiter.api.Test;

import com.github.benmanes.caffeine.jcache.configuration.CaffeineConfiguration;
import com.typesafe.config.ConfigFactory;

/**
 * Guards the wiring between the Caffeine/JCache provider and its {@code application.conf} resource.
 * The provider locates the {@code caffeine.jcache} root through Typesafe Config's {@code
 * ConfigFactory.load()}, and Hibernate's {@code JCacheRegionFactory} requests each region by name
 * from the resulting {@link CacheManager}. If {@code application.conf} ever stops being on the
 * runtime classpath (it lives in the :proprietary module), the per-region policies silently fall
 * back to Caffeine defaults and the bounded/TTL'd cache guarantees are lost - this test pins the
 * contract.
 */
class CaffeineJCacheConfigTest {

    @Test
    void applicationConfIsOnTheClasspath() {
        var config = ConfigFactory.load(getClass().getClassLoader());
        assertThat(config.hasPath("caffeine.jcache")).isTrue();
        assertThat(config.getInt("caffeine.jcache.users.policy.maximum.size")).isEqualTo(5000);
        assertThat(config.getString("caffeine.jcache.users.policy.eager-expiration.after-write"))
                .isEqualTo("5m");
    }

    @Test
    void regionPoliciesAreAppliedWhenCacheIsCreated() {
        try (CacheManager manager =
                Caching.getCachingProvider(
                                "com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider")
                        .getCacheManager()) {
            Cache<String, String> users = manager.getCache("users");
            assertThat(users).isNotNull();

            CaffeineConfiguration<?, ?> configuration =
                    (CaffeineConfiguration<?, ?>)
                            users.getConfiguration(CompleteConfiguration.class);
            assertThat(configuration.getMaximumSize()).hasValue(5000L);
        }
    }
}
