package stirling.software.proprietary.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobStats;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;

/**
 * Admin controller for job management. These endpoints require admin privileges
 * and provide insight into system jobs and queues.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
public class AdminJobController {

    private final TaskManager taskManager;
    private final JobQueue jobQueue;

    /**
     * Get statistics about jobs in the system (admin only)
     *
     * @return Job statistics
     */
    @GetMapping("/api/v1/admin/job/stats")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<JobStats> getJobStats() {
        JobStats stats = taskManager.getJobStats();
        log.info("Admin requested job stats: {} active, {} completed jobs", 
                stats.getActiveJobs(), stats.getCompletedJobs());
        return ResponseEntity.ok(stats);
    }

    /**
     * Get statistics about the job queue (admin only)
     *
     * @return Queue statistics
     */
    @GetMapping("/api/v1/admin/job/queue/stats")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> getQueueStats() {
        Map<String, Object> queueStats = jobQueue.getQueueStats();
        log.info("Admin requested queue stats: {} queued jobs", queueStats.get("queuedJobs"));
        return ResponseEntity.ok(queueStats);
    }

    /**
     * Manually trigger cleanup of old jobs (admin only)
     *
     * @return A response indicating how many jobs were cleaned up
     */
    @PostMapping("/api/v1/admin/job/cleanup")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> cleanupOldJobs() {
        int beforeCount = taskManager.getJobStats().getTotalJobs();
        taskManager.cleanupOldJobs();
        int afterCount = taskManager.getJobStats().getTotalJobs();
        int removedCount = beforeCount - afterCount;

        log.info("Admin triggered job cleanup: removed {} jobs, {} remaining", 
                removedCount, afterCount);

        return ResponseEntity.ok(
                Map.of(
                        "message", "Cleanup complete",
                        "removedJobs", removedCount,
                        "remainingJobs", afterCount));
    }
}