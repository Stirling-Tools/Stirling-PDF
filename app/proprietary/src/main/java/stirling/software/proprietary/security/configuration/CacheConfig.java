package stirling.software.proprietary.security.configuration;

import java.time.Duration;
import java.util.Map;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@EnableCaching
@Slf4j
public class CacheConfig {

    private final ApplicationProperties applicationProperties;

    public CacheConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    /** Short-TTL cache of recent audit rows, shared by every audit-derived portal view. */
    private static final String PORTAL_AUDIT_EVENTS_CACHE = "portalAuditEvents";

    @Bean
    public CacheManager cacheManager() {
        int keyRetentionDays = applicationProperties.getSecurity().getJwt().getKeyRetentionDays();
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(
                Caffeine.newBuilder()
                        .maximumSize(1000) // Make configurable?
                        .expireAfterWrite(Duration.ofDays(keyRetentionDays))
                        .recordStats());
        // 30s TTL keeps audit views near-live without re-scanning the DB; one entry per scope.
        cacheManager.registerCustomCache(
                PORTAL_AUDIT_EVENTS_CACHE,
                Caffeine.newBuilder()
                        .maximumSize(256)
                        .expireAfterWrite(Duration.ofSeconds(30))
                        .recordStats()
                        .build());
        return cacheManager;
    }

    /**
     * Stands the second-level cache down when the process-local regions would be unsafe: cluster
     * mode has more than one node behind the database, and an operator can rule the cache out
     * explicitly for multi-instance setups that do not use cluster mode yet.
     */
    @Bean
    HibernatePropertiesCustomizer hibernateSecondLevelCacheGate() {
        return hibernateProperties -> {
            if (applicationProperties.getCluster().isEnabled()) {
                log.warn(
                        "cluster.enabled=true: disabling the Hibernate second-level cache because"
                                + " the Caffeine regions are process-local and cannot be invalidated"
                                + " across nodes. Security and licensing reads fall back to the"
                                + " database.");
                disableSecondLevelCache(hibernateProperties);
                return;
            }
            if (!applicationProperties.getSecondLevelCache().isEnabled()) {
                log.info(
                        "secondLevelCache.enabled=false: Hibernate second-level cache disabled by"
                                + " configuration.");
                disableSecondLevelCache(hibernateProperties);
            }
        };
    }

    private static void disableSecondLevelCache(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.USE_SECOND_LEVEL_CACHE, false);
        hibernateProperties.put("jakarta.persistence.sharedCache.mode", "NONE");
    }
}
