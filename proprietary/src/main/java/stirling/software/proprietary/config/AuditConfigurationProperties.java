package stirling.software.proprietary.config;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditLevel;

/**
 * Configuration properties for the audit system. Reads values from the ApplicationProperties under
 * premium.enterpriseFeatures.audit
 */
@Slf4j
@Getter
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuditConfigurationProperties {

    private final boolean enabled;
    private final int level;
    private final int retentionDays;

    public AuditConfigurationProperties(ApplicationProperties applicationProperties) {
        ApplicationProperties.Premium.EnterpriseFeatures.Audit auditConfig =
                applicationProperties.getPremium().getEnterpriseFeatures().getAudit();
        // Read values directly from configuration
        this.enabled = auditConfig.isEnabled();

        // Ensure level is within valid bounds (0-3)
        int configLevel = auditConfig.getLevel();
        this.level = Math.min(Math.max(configLevel, 0), 3);

        // Retention days (0 means infinite)
        this.retentionDays = auditConfig.getRetentionDays();

        log.debug(
                "Initialized audit configuration: enabled={}, level={}, retentionDays={} (0=infinite)",
                this.enabled,
                this.level,
                this.retentionDays);
    }

    /**
     * Get the audit level as an enum
     *
     * @return The current AuditLevel
     */
    public AuditLevel getAuditLevel() {
        return AuditLevel.fromInt(level);
    }

    /**
     * Check if the current audit level includes the specified level
     *
     * @param requiredLevel The level to check against
     * @return true if auditing is enabled and the current level includes the required level
     */
    public boolean isLevelEnabled(AuditLevel requiredLevel) {
        return enabled && getAuditLevel().includes(requiredLevel);
    }

    /**
     * Get the effective retention period in days
     *
     * @return The number of days to retain audit records, or -1 for infinite retention
     */
    public int getEffectiveRetentionDays() {
        // 0 means infinite retention
        return retentionDays <= 0 ? -1 : retentionDays;
    }
}
