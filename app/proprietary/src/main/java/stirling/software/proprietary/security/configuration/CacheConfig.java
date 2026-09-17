package stirling.software.proprietary.security.configuration;

import java.time.Duration;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.github.benmanes.caffeine.cache.Caffeine;

@Configuration
@EnableCaching
public class CacheConfig {

    /** Short-TTL cache of recent audit rows, shared by every audit-derived portal view. */
    private static final String PORTAL_AUDIT_EVENTS_CACHE = "portalAuditEvents";

    /**
     * Caches are in-JVM, so a second node never sees an eviction here. Anything
     * authorisation-shaped needs a TTL short enough to bound that divergence, and explicit eviction
     * on every write.
     *
     * <p>The fallback below is deliberately strict: an unregistered cache name silently inherits
     * it, so it must never be long enough to keep a revoked user or role alive. Register a named
     * cache with its own spec rather than widening this.
     */
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(
                Caffeine.newBuilder()
                        .maximumSize(1000)
                        .expireAfterWrite(Duration.ofSeconds(30))
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
}
