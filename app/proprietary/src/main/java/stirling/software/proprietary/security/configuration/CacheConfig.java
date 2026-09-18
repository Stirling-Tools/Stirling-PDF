package stirling.software.proprietary.security.configuration;

import java.time.Duration;

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
     * The Caffeine second-level regions are process-local: in a multi-node deployment a write on
     * one node cannot invalidate another node's entries, so cached users, teams, licenses and
     * policies would authorize against stale state until the local TTL expires. Stand the cache
     * down when clustering is on; single-node deployments keep it.
     */
    @Bean
    HibernatePropertiesCustomizer hibernateSecondLevelCacheClusterGate() {
        return hibernateProperties -> {
            if (applicationProperties.getCluster().isEnabled()) {
                log.warn(
                        "cluster.enabled=true: disabling the Hibernate second-level cache because"
                                + " the Caffeine regions are process-local and cannot be invalidated"
                                + " across nodes. Security and licensing reads fall back to the"
                                + " database.");
                hibernateProperties.put(AvailableSettings.USE_SECOND_LEVEL_CACHE, false);
                hibernateProperties.put("jakarta.persistence.sharedCache.mode", "NONE");
            }
        };
    }
}
