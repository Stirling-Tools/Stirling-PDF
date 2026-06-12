package stirling.software.proprietary.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import io.quarkus.panache.common.Page;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/** Service to periodically clean up old audit events based on retention policy. */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class AuditCleanupService {

    private final PersistentAuditEventRepository auditRepository;
    private final AuditConfigurationProperties auditConfig;

    // Default batch size for deletions
    private static final int BATCH_SIZE = 10000;

    /**
     * Scheduled task that runs daily to clean up old audit events. The retention period is
     * configurable in settings.yml.
     */
    @Scheduled(every = "24h", delay = 24, delayUnit = java.util.concurrent.TimeUnit.HOURS)
    public void cleanupOldAuditEvents() {
        if (!auditConfig.isEnabled()) {
            return;
        }

        int retentionDays = auditConfig.getRetentionDays();
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
    private List<Long> findBatchOfIdsToDelete(Instant cutoffDate) {
        // Spring Data PageRequest.of(0, BATCH_SIZE, Sort.by("id")) -> Panache Page (first page,
        // BATCH_SIZE rows). The repository's JPQL already applies "ORDER BY e.id".
        Page page = Page.of(0, BATCH_SIZE);
        return auditRepository.findIdsForBatchDeletion(cutoffDate, page);
    }

    /** Deletes a batch of events by ID. Each batch is in its own transaction. */
    @Transactional
    private int deleteBatch(List<Long> batchIds) {
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
