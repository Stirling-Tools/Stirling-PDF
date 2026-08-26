package stirling.software.proprietary.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import io.quarkus.panache.common.Page;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Named;
import jakarta.transaction.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/** Service to periodically clean up old audit events based on retention policy. */
@Slf4j
@ApplicationScoped
public class AuditCleanupService {

    private final PersistentAuditEventRepository auditRepository;
    private final AuditConfigurationProperties auditConfig;
    private final boolean runningEE;

    // Default batch size for deletions
    private static final int BATCH_SIZE = 10000;

    /**
     * Maximum audit retention on non-Enterprise instances. Audit events feed the Documents tab on
     * every instance, but longer history is an Enterprise feature - so non-EE deployments keep a
     * shorter window ("infinite" included), bounding the always-on trail off-license.
     */
    private static final int NON_EE_MAX_RETENTION_DAYS = 30;

    public AuditCleanupService(
            PersistentAuditEventRepository auditRepository,
            AuditConfigurationProperties auditConfig,
            @Named("runningEE") boolean runningEE) {
        this.auditRepository = auditRepository;
        this.auditConfig = auditConfig;
        this.runningEE = runningEE;
    }

    /**
     * Scheduled task that runs daily to clean up old audit events. The retention period is
     * configurable in settings.yml.
     */
    @Scheduled(every = "24h", delay = 24, delayUnit = java.util.concurrent.TimeUnit.HOURS)
    public void cleanupOldAuditEvents() {
        if (!auditConfig.isEnabled()) {
            return;
        }

        int retentionDays = effectiveRetentionDays();
        if (retentionDays <= 0) {
            return;
        }

        log.info("Starting audit cleanup for events older than {} days", retentionDays);

        try {
            Instant cutoffDate = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
            int totalDeleted = batchDeleteEvents(cutoffDate);
            log.info(
                    "Successfully cleaned up {} audit events older than {}",
                    totalDeleted,
                    cutoffDate);
        } catch (Exception e) {
            log.error("Error cleaning up old audit events", e);
        }
    }

    /**
     * The retention window actually applied. Enterprise uses the configured value (0 = infinite);
     * non-Enterprise is clamped to {@link #NON_EE_MAX_RETENTION_DAYS}.
     */
    int effectiveRetentionDays() {
        int configured = auditConfig.getRetentionDays();
        if (runningEE) {
            return configured;
        }
        return configured <= 0
                ? NON_EE_MAX_RETENTION_DAYS
                : Math.min(configured, NON_EE_MAX_RETENTION_DAYS);
    }

    /**
     * Performs batch deletion of events to prevent long-running transactions and potential database
     * locks.
     */
    private int batchDeleteEvents(Instant cutoffDate) {
        int totalDeleted = 0;
        boolean hasMore = true;

        while (hasMore) {
            // Start a new transaction for each batch
            List<Long> batchIds = findBatchOfIdsToDelete(cutoffDate);

            if (batchIds.isEmpty()) {
                hasMore = false;
            } else {
                int deleted = deleteBatch(batchIds);
                totalDeleted += deleted;

                // If we got fewer records than the batch size, we're done
                if (batchIds.size() < BATCH_SIZE) {
                    hasMore = false;
                }
            }
        }

        return totalDeleted;
    }

    /** Finds a batch of IDs to delete. */
    @Transactional
    // package-private so the CDI @Transactional interceptor applies (was private under Spring)
    List<Long> findBatchOfIdsToDelete(Instant cutoffDate) {
        // Spring Data PageRequest.of(0, BATCH_SIZE, Sort.by("id")) -> Panache Page (first page,
        // BATCH_SIZE rows). The repository's JPQL already applies "ORDER BY e.id".
        Page page = Page.of(0, BATCH_SIZE);
        return auditRepository.findIdsForBatchDeletion(cutoffDate, page);
    }

    /** Deletes a batch of events by ID. Each batch is in its own transaction. */
    @Transactional
    // package-private so the CDI @Transactional interceptor applies (was private under Spring)
    int deleteBatch(List<Long> batchIds) {
        if (batchIds.isEmpty()) {
            return 0;
        }

        int batchSize = batchIds.size();
        // Spring Data deleteAllByIdInBatch(ids) -> Panache bulk delete by id collection.
        auditRepository.delete("id IN ?1", batchIds);
        log.debug("Deleted batch of {} audit events", batchSize);

        return batchSize;
    }
}
