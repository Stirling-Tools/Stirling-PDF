package stirling.software.proprietary.security.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.cache.CacheManager;
import javax.cache.Caching;
import javax.cache.spi.CachingProvider;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties.SecondLevelCache.Region;

class SecondLevelCacheRegionTunerTest {

    private static final List<String> REGIONS =
            List.of(
                    "policies",
                    "policy-sources",
                    "teams",
                    "user-license-settings",
                    "users",
                    "usersNaturalId",
                    "saas-pricing-policies");

    private CacheManager manager;

    @BeforeEach
    void setUp() {
        CachingProvider provider =
                Caching.getCachingProvider(
                        "com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider");
        // Own URI per test: the provider shares managers by URI, and these tests resize caches.
        manager =
                provider.getCacheManager(
                        URI.create("SecondLevelCacheRegionTunerTest-" + System.nanoTime()),
                        provider.getDefaultClassLoader());
        REGIONS.forEach(manager::getCache);
    }

    @AfterEach
    void tearDown() {
        manager.close();
    }

    private static Region region(Long maxEntries, Duration ttl) {
        Region region = new Region();
        region.setMaxEntries(maxEntries);
        region.setTtl(ttl);
        return region;
    }

    private long maximum(String name) {
        return SecondLevelCacheRegionTuner.policyOf(manager, name)
                .eviction()
                .orElseThrow()
                .getMaximum();
    }

    private Duration ttl(String name) {
        return SecondLevelCacheRegionTuner.policyOf(manager, name)
                .expireAfterWrite()
                .orElseThrow()
                .getExpiresAfter();
    }

    @Test
    void overridesSizeAndLifetimeOfTheNamedRegionOnly() {
        SecondLevelCacheRegionTuner.apply(
                manager, Map.of("users", region(200_000L, Duration.ofMinutes(2))));

        assertThat(maximum("users")).isEqualTo(200_000);
        assertThat(ttl("users")).isEqualTo(Duration.ofMinutes(2));
        assertThat(maximum("teams")).isEqualTo(20_000);
        assertThat(ttl("teams")).isEqualTo(Duration.ofMinutes(15));
    }

    @Test
    void leavesTheLifetimeAloneWhenOnlyTheSizeIsSet() {
        SecondLevelCacheRegionTuner.apply(manager, Map.of("teams", region(75_000L, null)));

        assertThat(maximum("teams")).isEqualTo(75_000);
        assertThat(ttl("teams")).isEqualTo(Duration.ofMinutes(15));
    }

    @Test
    void matchesKeysTheWaySpringAndEnvironmentVariablesSpellThem() {
        Map<String, Region> overrides = new LinkedHashMap<>();
        overrides.put("usersnaturalid", region(60_000L, null));
        overrides.put("policysources", region(3_000L, null));

        SecondLevelCacheRegionTuner.apply(manager, overrides);

        assertThat(maximum("usersNaturalId")).isEqualTo(60_000);
        assertThat(maximum("policy-sources")).isEqualTo(3_000);
    }

    @Test
    void anUnknownRegionFailsInsteadOfBeingIgnored() {
        assertThatThrownBy(
                        () ->
                                SecondLevelCacheRegionTuner.apply(
                                        manager, Map.of("userz", region(10L, null))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("secondLevelCache.regions.userz")
                .hasMessageContaining("usersNaturalId");
    }

    @Test
    void describesEveryRegionsEffectiveBounds() {
        assertThat(SecondLevelCacheRegionTuner.describe(manager))
                .contains("users max 50000 ttl PT5M")
                .contains("teams max 20000 ttl PT15M");
    }
}
