package stirling.software.proprietary.controller.api;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobStats;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

/**
 * Admin controller for job management. These endpoints require admin privileges and provide insight
 * into system jobs and queues.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ROLE_ADMIN')")
@Tag(name = "Admin Job Management", description = "Admin-only Job  Management APIs")
public class AdminJobController {

    private final TaskManager taskManager;
    private final JobQueue jobQueue;

    /**
     * Get statistics about jobs in the system (admin only)
     *
     * @return Job statistics
     */
    @GetMapping("/job/stats")
    @Operation(summary = "Get job statistics")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<JobStats> getJobStats() {
        JobStats stats = taskManager.getJobStats();
        log.info(
                "Admin requested job stats: {} active, {} completed jobs",
                stats.getActiveJobs(),
                stats.getCompletedJobs());
        return ResponseEntity.ok(stats);
    }

    /**
     * Get statistics about the job queue (admin only)
     *
     * @return Queue statistics
     */
    @GetMapping("/job/queue/stats")
    @Operation(summary = "Get job queue statistics")
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
    @PostMapping("/job/cleanup")
    @Operation(summary = "Cleanup old jobs")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> cleanupOldJobs() {
        int beforeCount = taskManager.getJobStats().getTotalJobs();
        taskManager.cleanupOldJobs();
        int afterCount = taskManager.getJobStats().getTotalJobs();
        int removedCount = beforeCount - afterCount;

        log.info(
                "Admin triggered job cleanup: removed {} jobs, {} remaining",
                removedCount,
                afterCount);

        return ResponseEntity.ok(
                Map.of(
                        "message", "Cleanup complete",
                        "removedJobs", removedCount,
                        "remainingJobs", afterCount));
    }
}
