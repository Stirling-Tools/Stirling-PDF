package stirling.software.proprietary.config;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditLevel;

/**
 * Configuration properties for the audit system.
 * Reads values from the ApplicationProperties under premium.proFeatures.audit
 */
@Slf4j
@Getter
@Component
public class AuditConfigurationProperties {

    private final boolean enabled;
    private final int level;
    private final int retentionDays;
    
    public AuditConfigurationProperties(ApplicationProperties applicationProperties) {
        ApplicationProperties.Premium.ProFeatures.Audit auditConfig = 
                applicationProperties.getPremium().getProFeatures().getAudit();
        
        this.enabled = auditConfig.isEnabled();
        this.level = auditConfig.getLevel();
        this.retentionDays = auditConfig.getRetentionDays();
        
        log.info("Initialized audit configuration: enabled={}, level={}, retentionDays={}", 
                this.enabled, this.level, this.retentionDays);
    }
    
    /**
     * Get the audit level as an enum
     * @return The current AuditLevel
     */
    public AuditLevel getAuditLevel() {
        return AuditLevel.fromInt(level);
    }
    
    /**
     * Check if the current audit level includes the specified level
     * @param requiredLevel The level to check against
     * @return true if auditing is enabled and the current level includes the required level
     */
    public boolean isLevelEnabled(AuditLevel requiredLevel) {
        return enabled && getAuditLevel().includes(requiredLevel);
    }
}