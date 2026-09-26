package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.stream.Stream;

import javax.cache.Cache;
import javax.cache.CacheManager;
import javax.cache.Caching;
import javax.cache.configuration.CompleteConfiguration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

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

    /**
     * Every region named by an entity {@code @Cache} must resolve to the bounded, TTL'd policy from
     * {@code application.conf}. A misspelled expiry key would otherwise fall back to Caffeine's
     * unbounded, eternal defaults for that region while the config file looks correct.
     */
    static Stream<Arguments> regions() {
        return Stream.of(
                Arguments.of("policies", 500L, Duration.ofMinutes(30)),
                Arguments.of("policy-sources", 500L, Duration.ofMinutes(30)),
                Arguments.of("teams", 1000L, Duration.ofMinutes(15)),
                Arguments.of("user-license-settings", 2000L, Duration.ofHours(1)),
                Arguments.of("users", 5000L, Duration.ofMinutes(5)),
                Arguments.of("saas-pricing-policies", 100L, Duration.ofSeconds(30)),
                Arguments.of("saas-legal-consents", 5000L, Duration.ofHours(1)),
                Arguments.of("saas-subscriptions", 5000L, Duration.ofMinutes(15)),
                Arguments.of("saas-user-extensions", 5000L, Duration.ofMinutes(5)),
                Arguments.of("saas-team-extensions", 1000L, Duration.ofMinutes(15)));
    }

    @ParameterizedTest(name = "{0} applies its configured bounds")
    @MethodSource("regions")
    void everyRegionAppliesItsConfiguredPolicy(
            String region, long maximumSize, Duration expireAfterWrite) {
        assertRegionPolicy(region, maximumSize, expireAfterWrite);
    }

    private static void assertRegionPolicy(
            String region, long maximumSize, Duration expireAfterWrite) {
        try (CacheManager manager =
                Caching.getCachingProvider(
                                "com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider")
                        .getCacheManager()) {
            Cache<?, ?> cache = manager.getCache(region);
            assertThat(cache)
                    .as("region <%s> is created from application.conf", region)
                    .isNotNull();

            CaffeineConfiguration<?, ?> configuration =
                    (CaffeineConfiguration<?, ?>)
                            cache.getConfiguration(CompleteConfiguration.class);
            assertThat(configuration.getMaximumSize())
                    .as("region <%s> maximum size", region)
                    .hasValue(maximumSize);
            assertThat(configuration.getExpireAfterWrite())
                    .as("region <%s> expire-after-write", region)
                    .hasValue(expireAfterWrite.toNanos());
        }
    }
}
