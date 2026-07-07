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

    /** Short-TTL caches for portal views derived from audit data (avoid per-load DB scans). */
    private static final String PORTAL_INFRA_AUDIT_CACHE = "portalInfraAuditLog";

    private static final String PORTAL_DOCUMENTS_CACHE = "portalDocuments";

    @Bean
    public CacheManager cacheManager() {
        int keyRetentionDays = applicationProperties.getSecurity().getJwt().getKeyRetentionDays();
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(
                Caffeine.newBuilder()
                        .maximumSize(1000) // Make configurable?
                        .expireAfterWrite(Duration.ofDays(keyRetentionDays))
                        .recordStats());
        // Portal audit view is refreshed frequently but must not re-scan the DB on every load;
        // a single entry with a 30s TTL keeps it near-live while shedding the query load.
        // One entry per scope: "server" (admins) plus one per team ("team:<id>").
        for (String cacheName : new String[] {PORTAL_INFRA_AUDIT_CACHE, PORTAL_DOCUMENTS_CACHE}) {
            cacheManager.registerCustomCache(
                    cacheName,
                    Caffeine.newBuilder()
                            .maximumSize(256)
                            .expireAfterWrite(Duration.ofSeconds(30))
                            .recordStats()
                            .build());
        }
        return cacheManager;
    }
}
