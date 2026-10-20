package stirling.software.proprietary.security.configuration;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeSet;

import javax.cache.Cache;
import javax.cache.CacheManager;

import org.hibernate.cache.jcache.internal.JCacheRegionFactory;
import org.hibernate.cache.spi.RegionFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.springframework.stereotype.Component;

import com.github.benmanes.caffeine.cache.Policy;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.EntityManagerFactory;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.SecondLevelCache.Region;

@Slf4j
@Component
public class SecondLevelCacheRegionTuner {

    private final EntityManagerFactory entityManagerFactory;
    private final ApplicationProperties applicationProperties;

    public SecondLevelCacheRegionTuner(
            EntityManagerFactory entityManagerFactory,
            ApplicationProperties applicationProperties) {
        this.entityManagerFactory = entityManagerFactory;
        this.applicationProperties = applicationProperties;
    }

    @PostConstruct
    void applyOverrides() {
        RegionFactory regionFactory =
                entityManagerFactory
                        .unwrap(SessionFactoryImplementor.class)
                        .getCache()
                        .getRegionFactory();
        if (!(regionFactory instanceof JCacheRegionFactory jcache)) {
            return;
        }
        apply(jcache.getCacheManager(), applicationProperties.getSecondLevelCache().getRegions());
    }

    static void apply(CacheManager cacheManager, Map<String, Region> overrides) {
        for (Map.Entry<String, Region> override : overrides.entrySet()) {
            Policy<?, ?> policy = policyOf(cacheManager, resolve(cacheManager, override.getKey()));
            Region region = override.getValue();
            if (region.getMaxEntries() != null) {
                policy.eviction()
                        .orElseThrow(() -> unbounded(override.getKey()))
                        .setMaximum(region.getMaxEntries());
            }
            if (region.getTtl() != null) {
                policy.expireAfterWrite()
                        .orElseThrow(() -> unbounded(override.getKey()))
                        .setExpiresAfter(region.getTtl());
            }
        }
        log.info("Second-level cache regions: {}", describe(cacheManager));
    }

    static String describe(CacheManager cacheManager) {
        List<String> regions = new ArrayList<>();
        for (String name : regionNames(cacheManager)) {
            Policy<?, ?> policy = policyOf(cacheManager, name);
            String max =
                    policy.eviction().map(e -> String.valueOf(e.getMaximum())).orElse("unbounded");
            String ttl =
                    policy.expireAfterWrite()
                            .map(e -> e.getExpiresAfter().toString())
                            .orElse("no expiry");
            regions.add(name + " max " + max + " ttl " + ttl);
        }
        return String.join(", ", regions);
    }

    private static TreeSet<String> regionNames(CacheManager cacheManager) {
        TreeSet<String> names = new TreeSet<>();
        cacheManager.getCacheNames().forEach(names::add);
        return names;
    }

    static String resolve(CacheManager cacheManager, String key) {
        String wanted = normalise(key);
        for (String name : regionNames(cacheManager)) {
            if (normalise(name).equals(wanted)) {
                return name;
            }
        }
        throw new IllegalStateException(
                "secondLevelCache.regions."
                        + key
                        + " names no cache region; known regions: "
                        + regionNames(cacheManager));
    }

    private static String normalise(String name) {
        return name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    static Policy<?, ?> policyOf(CacheManager cacheManager, String region) {
        Cache<Object, Object> cache = cacheManager.getCache(region);
        return cache.unwrap(com.github.benmanes.caffeine.cache.Cache.class).policy();
    }

    private static IllegalStateException unbounded(String region) {
        return new IllegalStateException(
                "Second-level cache region "
                        + region
                        + " has no size bound or expiry in application.conf to override");
    }
}
