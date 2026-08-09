package stirling.software.proprietary.security.configuration;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.github.benmanes.caffeine.cache.Caffeine;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@EnableCaching
public class CacheConfig {

    private final ApplicationProperties applicationProperties;

    @Autowired
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
        // Team/install-wide usage aggregates, shared by every user so the wide scans run once
        // per TTL regardless of how many people are browsing tools.
        cacheManager.registerCustomCache(
                "toolRecommendationSignals",
                Caffeine.newBuilder()
                        .maximumSize(10_000)
                        .expireAfterWrite(Duration.ofMinutes(5))
                        .recordStats()
                        .build());
        return cacheManager;
    }
}
