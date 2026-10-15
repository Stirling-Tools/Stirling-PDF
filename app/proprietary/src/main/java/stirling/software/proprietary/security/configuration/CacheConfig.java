package stirling.software.proprietary.security.configuration;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
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

    /** kid to KeyPair. Key material is immutable, so the bound is about exposure, not staleness. */
    public static final String SIGNING_KEYS_CACHE = "signingKeys";

    /** Single node: eviction is authoritative, so the TTL is only a backstop. */
    private static final Duration SINGLE_NODE_FALLBACK = Duration.ofMinutes(10);

    /** Clustered: one node's eviction never reaches another, so the TTL is the whole guarantee. */
    private static final Duration CLUSTERED_FALLBACK = Duration.ofSeconds(30);

    private final boolean clusterEnabled;

    public CacheConfig(@Value("${cluster.enabled:false}") boolean clusterEnabled) {
        this.clusterEnabled = clusterEnabled;
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
                                clusterEnabled ? CLUSTERED_FALLBACK : SINGLE_NODE_FALLBACK)
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
        // decrypted private half in memory for the life of the process.
        cacheManager.registerCustomCache(
                SIGNING_KEYS_CACHE,
                Caffeine.newBuilder()
                        .maximumSize(50)
                        .expireAfterAccess(Duration.ofHours(1))
                        .recordStats()
                        .build());
        return cacheManager;
    }
}
