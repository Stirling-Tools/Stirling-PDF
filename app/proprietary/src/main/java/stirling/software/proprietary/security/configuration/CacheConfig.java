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

    /**
     * One short-TTL cache of recent audit rows, shared by every portal view derived from the audit
     * trail (the Audit tab and Documents page both map from the same cached read).
     */
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
        // Portal audit views refresh frequently but must not re-scan the DB on every load; a 30s
        // TTL keeps them near-live while shedding the query load. One entry per scope: "server"
        // (admins) plus one per team ("team:<id>"), shared across every audit-derived surface.
        cacheManager.registerCustomCache(
                PORTAL_AUDIT_EVENTS_CACHE,
                Caffeine.newBuilder()
                        .maximumSize(256)
                        .expireAfterWrite(Duration.ofSeconds(30))
                        .recordStats()
                        .build());
        return cacheManager;
    }
}
