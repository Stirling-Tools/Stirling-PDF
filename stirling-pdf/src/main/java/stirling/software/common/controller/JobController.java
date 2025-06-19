package stirling.software.common.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

/** REST controller for job-related endpoints */
@RestController
@RequiredArgsConstructor
@Slf4j
public class JobController {

    private final TaskManager taskManager;
    private final FileStorage fileStorage;
    private final JobQueue jobQueue;

    /**
     * Get the status of a job
     *
     * @param jobId The job ID
     * @return The job result
     */
    @GetMapping("/api/v1/general/job/{jobId}")
    public ResponseEntity<?> getJobStatus(@PathVariable("jobId") String jobId) {
        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        // Check if the job is in the queue and add queue information
        if (!result.isComplete() && jobQueue.isJobQueued(jobId)) {
            int position = jobQueue.getJobPosition(jobId);
            Map<String, Object> resultWithQueueInfo =
                    Map.of(
                            "jobResult",
                            result,
                            "queueInfo",
                            Map.of("inQueue", true, "position", position));
            return ResponseEntity.ok(resultWithQueueInfo);
        }

        return ResponseEntity.ok(result);
    }

    /**
     * Get the result of a job
     *
     * @param jobId The job ID
     * @return The job result
     */
    @GetMapping("/api/v1/general/job/{jobId}/result")
    public ResponseEntity<?> getJobResult(@PathVariable("jobId") String jobId) {
        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        if (!result.isComplete()) {
            return ResponseEntity.badRequest().body("Job is not complete yet");
        }

        if (result.getError() != null) {
            return ResponseEntity.badRequest().body("Job failed: " + result.getError());
        }

        if (result.getFileId() != null) {
            try {
                byte[] fileContent = fileStorage.retrieveBytes(result.getFileId());
                return ResponseEntity.ok()
                        .header("Content-Type", result.getContentType())
                        .header(
                                "Content-Disposition",
                                "form-data; name=\"attachment\"; filename=\""
                                        + result.getOriginalFileName()
                                        + "\"")
                        .body(fileContent);
            } catch (Exception e) {
                log.error("Error retrieving file for job {}: {}", jobId, e.getMessage(), e);
                return ResponseEntity.internalServerError()
                        .body("Error retrieving file: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(result.getResult());
    }

    /**
     * Get statistics about jobs in the system
     *
     * @return Job statistics
     */
    @GetMapping("/api/v1/general/job/stats")
    public ResponseEntity<JobStats> getJobStats() {
        JobStats stats = taskManager.getJobStats();
        return ResponseEntity.ok(stats);
    }

    /**
     * Get statistics about the job queue
     *
     * @return Queue statistics
     */
    @GetMapping("/api/v1/general/job/queue/stats")
    public ResponseEntity<?> getQueueStats() {
        Map<String, Object> queueStats = jobQueue.getQueueStats();
        return ResponseEntity.ok(queueStats);
    }

    /**
     * Manually trigger cleanup of old jobs
     *
     * @return A response indicating how many jobs were cleaned up
     */
    @PostMapping("/api/v1/general/job/cleanup")
    public ResponseEntity<?> cleanupOldJobs() {
        int beforeCount = taskManager.getJobStats().getTotalJobs();
        taskManager.cleanupOldJobs();
        int afterCount = taskManager.getJobStats().getTotalJobs();
        int removedCount = beforeCount - afterCount;

        return ResponseEntity.ok(
                Map.of(
                        "message", "Cleanup complete",
                        "removedJobs", removedCount,
                        "remainingJobs", afterCount));
    }

    /**
     * Cancel a job by its ID
     *
     * @param jobId The job ID
     * @return Response indicating whether the job was cancelled
     */
    @DeleteMapping("/api/v1/general/job/{jobId}")
    public ResponseEntity<?> cancelJob(@PathVariable("jobId") String jobId) {
        log.debug("Request to cancel job: {}", jobId);

        // First check if the job is in the queue
        boolean cancelled = false;
        int queuePosition = -1;

        if (jobQueue.isJobQueued(jobId)) {
            queuePosition = jobQueue.getJobPosition(jobId);
            cancelled = jobQueue.cancelJob(jobId);
            log.info("Cancelled queued job: {} (was at position {})", jobId, queuePosition);
        }

        // If not in queue or couldn't cancel, try to cancel in TaskManager
        if (!cancelled) {
            JobResult result = taskManager.getJobResult(jobId);
            if (result != null && !result.isComplete()) {
                // Mark as error with cancellation message
                taskManager.setError(jobId, "Job was cancelled by user");
                cancelled = true;
                log.info("Marked job as cancelled in TaskManager: {}", jobId);
            }
        }

        if (cancelled) {
            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "Job cancelled successfully",
                            "wasQueued",
                            queuePosition >= 0,
                            "queuePosition",
                            queuePosition >= 0 ? queuePosition : "n/a"));
        } else {
            // Job not found or already complete
            JobResult result = taskManager.getJobResult(jobId);
            if (result == null) {
                return ResponseEntity.notFound().build();
            } else if (result.isComplete()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Cannot cancel job that is already complete"));
            } else {
                return ResponseEntity.internalServerError()
                        .body(Map.of("message", "Failed to cancel job for unknown reason"));
            }
        }
    }
}
