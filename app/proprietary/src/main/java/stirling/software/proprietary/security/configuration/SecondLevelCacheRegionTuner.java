package stirling.software.proprietary.security.configuration;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;

import javax.cache.Cache;
import javax.cache.CacheManager;

import org.hibernate.cache.jcache.internal.JCacheRegionFactory;
import org.hibernate.cache.spi.RegionFactory;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.springframework.beans.factory.ObjectProvider;
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
    private final ObjectProvider<SecondLevelCacheRegionDefaults> defaults;

    public SecondLevelCacheRegionTuner(
            EntityManagerFactory entityManagerFactory,
            ApplicationProperties applicationProperties,
            ObjectProvider<SecondLevelCacheRegionDefaults> defaults) {
        this.entityManagerFactory = entityManagerFactory;
        this.applicationProperties = applicationProperties;
        this.defaults = defaults;
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
        SecondLevelCacheRegionDefaults profileDefaults = defaults.getIfAvailable();
        apply(
                jcache.getCacheManager(),
                profileDefaults == null ? Map.of() : profileDefaults.regions(),
                applicationProperties.getSecondLevelCache().getRegions());
    }

    static void apply(
            CacheManager cacheManager,
            Map<String, Region> defaults,
            Map<String, Region> overrides) {
        for (Map.Entry<String, Region> region :
                merge(cacheManager, defaults, overrides).entrySet()) {
            Policy<?, ?> policy = policyOf(cacheManager, region.getKey());
            if (region.getValue().getMaxEntries() != null) {
                policy.eviction()
                        .orElseThrow(() -> unbounded(region.getKey()))
                        .setMaximum(region.getValue().getMaxEntries());
            }
            if (region.getValue().getTtl() != null) {
                policy.expireAfterWrite()
                        .orElseThrow(() -> unbounded(region.getKey()))
                        .setExpiresAfter(region.getValue().getTtl());
            }
        }
        log.info("Second-level cache regions: {}", describe(cacheManager));
    }

    static Map<String, Region> merge(
            CacheManager cacheManager,
            Map<String, Region> defaults,
            Map<String, Region> overrides) {
        Map<String, Region> merged = new TreeMap<>();
        defaults.forEach(
                (key, region) -> {
                    Region target =
                            merged.computeIfAbsent(resolve(cacheManager, key), n -> new Region());
                    target.setMaxEntries(region.getMaxEntries());
                    target.setTtl(region.getTtl());
                });
        Map<String, String> setBy = new HashMap<>();
        for (Map.Entry<String, Region> override : overrides.entrySet()) {
            String name = resolve(cacheManager, override.getKey());
            Region target = merged.computeIfAbsent(name, n -> new Region());
            Region region = override.getValue();
            if (region.getMaxEntries() != null) {
                claim(
                        setBy,
                        name,
                        "maxEntries",
                        override.getKey(),
                        target.getMaxEntries(),
                        region.getMaxEntries());
                target.setMaxEntries(region.getMaxEntries());
            }
            if (region.getTtl() != null) {
                claim(setBy, name, "ttl", override.getKey(), target.getTtl(), region.getTtl());
                target.setTtl(region.getTtl());
            }
        }
        return merged;
    }

    private static void claim(
            Map<String, String> setBy,
            String region,
            String field,
            String key,
            Object current,
            Object wanted) {
        String earlier = setBy.putIfAbsent(region + "." + field, key);
        if (earlier != null && !earlier.equals(key) && !Objects.equals(current, wanted)) {
            throw new IllegalStateException(
                    "secondLevelCache.regions."
                            + earlier
                            + "."
                            + field
                            + " and secondLevelCache.regions."
                            + key
                            + "."
                            + field
                            + " both set region "
                            + region
                            + " to different values; keep one spelling");
        }
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
