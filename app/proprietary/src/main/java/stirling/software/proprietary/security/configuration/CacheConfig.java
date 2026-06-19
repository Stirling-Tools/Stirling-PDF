package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import stirling.software.common.model.ApplicationProperties;

// TODO: Migration required - Spring's @EnableCaching + a programmatic CaffeineCacheManager
// @Bean has no direct Quarkus equivalent. Quarkus caching is annotation-driven
// (io.quarkus.cache.@CacheResult / @CacheInvalidate / @CacheName) and configured
// declaratively in application.properties, e.g.:
//   quarkus.cache.caffeine."<cache-name>".maximum-size=1000
//   quarkus.cache.caffeine."<cache-name>".expire-after-write=<keyRetentionDays>D
//   quarkus.cache.caffeine."<cache-name>".metrics-enabled=true   # was .recordStats()
// The expire-after-write here was derived at runtime from
// applicationProperties.getSecurity().getJwt().getKeyRetentionDays(); since Quarkus
// cache config is static, either pin a static value in application.properties or use
// io.quarkus.cache.CacheManager#getCache(...) programmatically to rebuild the cache
// with a runtime TTL. Annotate the relevant cached methods (previously relying on the
// Spring CacheManager) with @CacheResult(cacheName = "<cache-name>").
@ApplicationScoped
public class CacheConfig {

    private final ApplicationProperties applicationProperties;

    @Inject
    public CacheConfig(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    /**
     * Retained for reference: the JWT key retention window (in days) that previously drove
     * Caffeine's expireAfterWrite. Used by the Quarkus cache migration described above to derive
     * the TTL for the corresponding named cache.
     */
    public int getKeyRetentionDays() {
        return applicationProperties.getSecurity().getJwt().getKeyRetentionDays();
    }
}
