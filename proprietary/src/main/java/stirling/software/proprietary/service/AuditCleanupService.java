package stirling.software.proprietary.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.TimeUnit;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/**
 * Service to periodically clean up old audit events based on retention policy.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditCleanupService {

    private final PersistentAuditEventRepository auditRepository;
    private final AuditConfigurationProperties auditConfig;
    
    /**
     * Scheduled task that runs daily to clean up old audit events.
     * The retention period is configurable in settings.yml.
     */
    @Scheduled(fixedDelay = 1, initialDelay = 1, timeUnit = TimeUnit.DAYS)
    public void cleanupOldAuditEvents() {
        if (!auditConfig.isEnabled()) {
            log.debug("Audit system is disabled, skipping cleanup");
            return;
        }
        
        int retentionDays = auditConfig.getRetentionDays();
        if (retentionDays <= 0) {
            log.info("Audit retention is set to {} days, no cleanup needed", retentionDays);
            return;
        }
        
        log.info("Starting audit cleanup for events older than {} days", retentionDays);
        
        try {
            Instant cutoffDate = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
            auditRepository.deleteByTimestampBefore(cutoffDate);
            log.info("Successfully cleaned up audit events older than {}", cutoffDate);
        } catch (Exception e) {
            log.error("Error cleaning up old audit events", e);
        }
    }
}