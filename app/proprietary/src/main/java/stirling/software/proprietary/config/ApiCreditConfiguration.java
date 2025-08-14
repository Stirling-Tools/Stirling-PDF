package stirling.software.proprietary.config;

import java.util.Map;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.service.ApiCreditService;

@Configuration
@ConfigurationProperties(prefix = "api.credit-system")
@Data
@Slf4j
public class ApiCreditConfiguration {

    private boolean enabled = true;
    private boolean excludeSettings = true;
    private boolean excludeActuator = true;
    private int defaultCreditCost = 1;

    /**
     * Default monthly credit limits by role. Override in application.yml/properties. Note:
     * Integer.MAX_VALUE is treated as "unlimited".
     */
    private Map<String, Integer> defaultCreditLimits =
            Map.of(
                    "ROLE_SYSTEM_ADMIN", Integer.MAX_VALUE,
                    "ROLE_ORG_ADMIN", 10000,
                    "ROLE_TEAM_LEAD", 5000,
                    "ROLE_ADMIN", Integer.MAX_VALUE,
                    "ROLE_USER", 50,
                    "ROLE_DEMO_USER", 20,
                    "STIRLING-PDF-BACKEND-API-USER", Integer.MAX_VALUE);

    @Bean
    public CommandLineRunner initializeDefaultCreditLimits(ApiCreditService creditService) {
        return args -> {
            if (!enabled) {
                log.info("API credit system is disabled");
                return;
            }
            log.info("Initializing default API credit limits...");
            initializeDefaults(creditService);
            log.info("Default API credit limits initialized successfully");
        };
    }

    private void initializeDefaults(ApiCreditService creditService) {
        for (Map.Entry<String, Integer> entry : defaultCreditLimits.entrySet()) {
            String roleName = entry.getKey();
            Integer creditLimit = entry.getValue();

            try {
                Role.fromString(roleName);
                creditService.createOrUpdateRoleDefault(roleName, creditLimit);
                log.debug(
                        "Set default credit limit for role {} to {}/month",
                        roleName,
                        creditLimit == Integer.MAX_VALUE ? "unlimited" : creditLimit);
            } catch (IllegalArgumentException e) {
                log.warn("Skipping unknown role in credit system config: {}", roleName);
            }
        }
    }
}
