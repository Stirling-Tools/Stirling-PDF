package stirling.software.saas.config;

import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.arc.profile.IfBuildProfile;

import lombok.Data;

// TODO: Migration required - @ConfigurationProperties(prefix="credits"); bind via @ConfigProperty or @ConfigMapping
@Data
@ApplicationScoped
@IfBuildProfile("saas")
public class CreditsProperties {

    /** Whether the credits system is enabled */
    private boolean enabled = true;

    /** Credit allocations per billing cycle (monthly) */
    private CycleAllocations cycle = new CycleAllocations();

    /** Reset configuration */
    private Reset reset = new Reset();

    /** Error tracking configuration */
    private Errors errors = new Errors();

    /** Cache configuration */
    private Cache cache = new Cache();

    @Data
    public static class CycleAllocations {
        /** Whether admin role has unlimited credits */
        private boolean adminUnlimited = true;

        /** Credit allocations per billing cycle (monthly) per role */
        private Map<String, Integer> allocations =
                Map.of(
                        "ROLE_ADMIN", 1000,
                        "ROLE_PRO_USER", 500,
                        "ROLE_USER", 50,
                        "ROLE_LIMITED_API_USER", 10,
                        "ROLE_EXTRA_LIMITED_API_USER", 20,
                        "ROLE_WEB_ONLY_USER", 0,
                        "ROLE_DEMO_USER", 100);
    }

    @Data
    public static class Reset {
        /** Cron expression for monthly reset (default: 1st of month 02:00 UTC) */
        private String cron = "0 0 2 1 * *";

        /** Time zone for the reset schedule */
        private String zone = "UTC";
    }

    @Data
    public static class Errors {
        /** How long error counts are tracked (in minutes) */
        private int ttlMinutes = 60;

        /** Number of free processing errors before charging */
        private int freeProcessingErrors = 2;
    }

    @Data
    public static class Cache {
        /** Enable local Caffeine cache for error counts */
        private boolean localEnabled = true;

        /** Enable Redis cache for multi-instance deployments */
        private boolean redisEnabled = false;
    }
}
