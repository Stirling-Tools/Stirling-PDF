package stirling.software.proprietary.config;

import java.util.Map;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.service.ApiRateLimitService;

@Configuration
@ConfigurationProperties(prefix = "api.rate-limit")
@Data
@Slf4j
public class ApiRateLimitConfiguration {

    private boolean enabled = true;
    private boolean excludeSettings = true;
    private boolean excludeActuator = true;

    /**
     * Default monthly limits by role. Override in application.yml/properties.
     * Note: Integer.MAX_VALUE is treated as "unlimited".
     */
    private Map<String, Integer> defaultLimits = Map.of(
        "ROLE_SYSTEM_ADMIN", Integer.MAX_VALUE,
        "ROLE_ORG_ADMIN", 10000,
        "ROLE_TEAM_LEAD", 5000,
        "ROLE_ADMIN", Integer.MAX_VALUE,
        "ROLE_USER", 1000,
        "ROLE_DEMO_USER", 100,
        "STIRLING-PDF-BACKEND-API-USER", Integer.MAX_VALUE
    );

    @Bean
    public CommandLineRunner initializeDefaultRateLimits(ApiRateLimitService rateLimitService) {
        return args -> {
            if (!enabled) {
                log.info("API rate limiting is disabled");
                return;
            }
            log.info("Initializing default API rate limits...");
            initializeDefaults(rateLimitService);
            log.info("Default API rate limits initialized successfully");
        };
    }

    private void initializeDefaults(ApiRateLimitService rateLimitService) {
        for (Map.Entry<String, Integer> entry : defaultLimits.entrySet()) {
            String roleName = entry.getKey();
            Integer limit = entry.getValue();

            try {
                Role.fromString(roleName);
                rateLimitService.createOrUpdateRoleDefault(roleName, limit);
                log.debug("Set default rate limit for role {} to {}/month",
                          roleName, limit == Integer.MAX_VALUE ? "unlimited" : limit);
            } catch (IllegalArgumentException e) {
                log.warn("Skipping unknown role in rate limit config: {}", roleName);
            }
        }
    }
}