package stirling.software.common.service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;

/** Manages async tasks and their results */
@Service
@Slf4j
public class TaskManager {
    private final Map<String, JobResult> jobResults = new ConcurrentHashMap<>();

    @Value("${stirling.jobResultExpiryMinutes:30}")
    private int jobResultExpiryMinutes = 30;

    private final FileStorage fileStorage;
    private final ScheduledExecutorService cleanupExecutor =
            Executors.newSingleThreadScheduledExecutor();

    /** Initialize the task manager and start the cleanup scheduler */
    public TaskManager(FileStorage fileStorage) {
        this.fileStorage = fileStorage;

        // Schedule periodic cleanup of old job results
        cleanupExecutor.scheduleAtFixedRate(
                this::cleanupOldJobs,
                10, // Initial delay
                10, // Interval
                TimeUnit.MINUTES);

        log.debug(
                "Task manager initialized with job result expiry of {} minutes",
                jobResultExpiryMinutes);
    }

    /**
     * Create a new task with the given job ID
     *
     * @param jobId The job ID
     */
    public void createTask(String jobId) {
        jobResults.put(jobId, JobResult.createNew(jobId));
        log.debug("Created task with job ID: {}", jobId);
    }

    /**
     * Set the result of a task as a general object
     *
     * @param jobId The job ID
     * @param result The result object
     */
    public void setResult(String jobId, Object result) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.completeWithResult(result);
        log.debug("Set result for job ID: {}", jobId);
    }

    /**
     * Set the result of a task as a file
     *
     * @param jobId The job ID
     * @param fileId The file ID
     * @param originalFileName The original file name
     * @param contentType The content type of the file
     */
    public void setFileResult(
            String jobId, String fileId, String originalFileName, String contentType) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.completeWithFile(fileId, originalFileName, contentType);
        log.debug("Set file result for job ID: {} with file ID: {}", jobId, fileId);
    }

    /**
     * Set an error for a task
     *
     * @param jobId The job ID
     * @param error The error message
     */
    public void setError(String jobId, String error) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.failWithError(error);
        log.debug("Set error for job ID: {}: {}", jobId, error);
    }

    /**
     * Mark a task as complete
     *
     * @param jobId The job ID
     */
    public void setComplete(String jobId) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        if (jobResult.getResult() == null
                && jobResult.getFileId() == null
                && jobResult.getError() == null) {
            // If no result or error has been set, mark it as complete with an empty result
            jobResult.completeWithResult("Task completed successfully");
        }
        log.debug("Marked job ID: {} as complete", jobId);
    }

    /**
     * Check if a task is complete
     *
     * @param jobId The job ID
     * @return true if the task is complete, false otherwise
     */
    public boolean isComplete(String jobId) {
        JobResult result = jobResults.get(jobId);
        return result != null && result.isComplete();
    }

    /**
     * Get the result of a task
     *
     * @param jobId The job ID
     * @return The result object, or null if the task doesn't exist or is not complete
     */
    public JobResult getJobResult(String jobId) {
        return jobResults.get(jobId);
    }

    /**
     * Get statistics about all jobs in the system
     *
     * @return Job statistics
     */
    public JobStats getJobStats() {
        int totalJobs = jobResults.size();
        int activeJobs = 0;
        int completedJobs = 0;
        int failedJobs = 0;
        int successfulJobs = 0;
        int fileResultJobs = 0;

        LocalDateTime oldestActiveJobTime = null;
        LocalDateTime newestActiveJobTime = null;
        long totalProcessingTimeMs = 0;

        for (JobResult result : jobResults.values()) {
            if (result.isComplete()) {
                completedJobs++;

                // Calculate processing time for completed jobs
                if (result.getCreatedAt() != null && result.getCompletedAt() != null) {
                    long processingTimeMs =
                            java.time.Duration.between(
                                            result.getCreatedAt(), result.getCompletedAt())
                                    .toMillis();
                    totalProcessingTimeMs += processingTimeMs;
                }

                if (result.getError() != null) {
                    failedJobs++;
                } else {
                    successfulJobs++;
                    if (result.getFileId() != null) {
                        fileResultJobs++;
                    }
                }
            } else {
                activeJobs++;

                // Track oldest and newest active jobs
                if (result.getCreatedAt() != null) {
                    if (oldestActiveJobTime == null
                            || result.getCreatedAt().isBefore(oldestActiveJobTime)) {
                        oldestActiveJobTime = result.getCreatedAt();
                    }

                    if (newestActiveJobTime == null
                            || result.getCreatedAt().isAfter(newestActiveJobTime)) {
                        newestActiveJobTime = result.getCreatedAt();
                    }
                }
            }
        }

        // Calculate average processing time
        long averageProcessingTimeMs =
                completedJobs > 0 ? totalProcessingTimeMs / completedJobs : 0;

        return JobStats.builder()
                .totalJobs(totalJobs)
                .activeJobs(activeJobs)
                .completedJobs(completedJobs)
                .failedJobs(failedJobs)
                .successfulJobs(successfulJobs)
                .fileResultJobs(fileResultJobs)
                .oldestActiveJobTime(oldestActiveJobTime)
                .newestActiveJobTime(newestActiveJobTime)
                .averageProcessingTimeMs(averageProcessingTimeMs)
                .build();
    }

    /**
     * Get or create a job result
     *
     * @param jobId The job ID
     * @return The job result
     */
    private JobResult getOrCreateJobResult(String jobId) {
        return jobResults.computeIfAbsent(jobId, JobResult::createNew);
    }

    /** Clean up old completed job results */
    public void cleanupOldJobs() {
        LocalDateTime expiryThreshold =
                LocalDateTime.now().minus(jobResultExpiryMinutes, ChronoUnit.MINUTES);
        int removedCount = 0;

        try {
            for (Map.Entry<String, JobResult> entry : jobResults.entrySet()) {
                JobResult result = entry.getValue();

                // Remove completed jobs that are older than the expiry threshold
                if (result.isComplete()
                        && result.getCompletedAt() != null
                        && result.getCompletedAt().isBefore(expiryThreshold)) {

                    // If the job has a file result, delete the file
                    if (result.getFileId() != null) {
                        try {
                            fileStorage.deleteFile(result.getFileId());
                        } catch (Exception e) {
                            log.warn(
                                    "Failed to delete file for job {}: {}",
                                    entry.getKey(),
                                    e.getMessage());
                        }
                    }

                    // Remove the job result
                    jobResults.remove(entry.getKey());
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                log.info("Cleaned up {} expired job results", removedCount);
            }
        } catch (Exception e) {
            log.error("Error during job cleanup: {}", e.getMessage(), e);
        }
    }

    /** Shutdown the cleanup executor */
    @PreDestroy
    public void shutdown() {
        try {
            log.info("Shutting down job result cleanup executor");
            cleanupExecutor.shutdown();
            if (!cleanupExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                cleanupExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            cleanupExecutor.shutdownNow();
        }
    }
}
