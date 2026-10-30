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
import com.github.benmanes.caffeine.cache.Scheduler;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@EnableCaching
@Slf4j
public class CacheConfig {

    /** Short-TTL cache of recent audit rows, shared by every audit-derived portal view. */
    private static final String PORTAL_AUDIT_EVENTS_CACHE = "portalAuditEvents";

    /** kid to KeyPair. Key material is immutable, so the bound is about exposure, not staleness. */
    public static final String SIGNING_KEYS_CACHE = "signingKeys";

    /** Single node: eviction is authoritative, so the TTL is only a backstop. */
    private static final Duration SINGLE_NODE_FALLBACK = Duration.ofMinutes(10);

    /** Clustered: one node's eviction never reaches another, so the TTL is the whole guarantee. */
    private static final Duration CLUSTERED_FALLBACK = Duration.ofSeconds(30);

    private final ApplicationProperties applicationProperties;

    public CacheConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    /**
     * The fallback spec is what an unregistered cache name silently inherits, so it is sized to be
     * safe rather than useful: short enough that a revoked user or role cannot outlive it on a node
     * that never saw the eviction. Register a named cache with its own spec rather than widening
     * it.
     */
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(
                Caffeine.newBuilder()
                        .maximumSize(1000)
                        .expireAfterWrite(
                                applicationProperties.getCluster().isEnabled()
                                        ? CLUSTERED_FALLBACK
                                        : SINGLE_NODE_FALLBACK)
                        .recordStats());
        // 30s TTL keeps audit views near-live without re-scanning the DB; one entry per scope.
        cacheManager.registerCustomCache(
                PORTAL_AUDIT_EVENTS_CACHE,
                Caffeine.newBuilder()
                        .maximumSize(256)
                        .expireAfterWrite(Duration.ofSeconds(30))
                        .recordStats()
                        .build());
        // Bounded and idle-expiring so a token signed by a long-retired kid cannot pin its
        // decrypted private half in memory for the life of the process. The scheduler evicts on
        // time: Caffeine otherwise only expires during later cache activity, which an idle node
        // may never have.
        cacheManager.registerCustomCache(
                SIGNING_KEYS_CACHE,
                Caffeine.newBuilder()
                        .maximumSize(50)
                        .expireAfterAccess(Duration.ofHours(1))
                        .scheduler(Scheduler.systemScheduler())
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
