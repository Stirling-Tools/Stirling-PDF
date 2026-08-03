package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import stirling.software.common.model.ApplicationProperties;

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
