package stirling.software.common.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.context.JobContextHolder;

/**
 * Convenience service that exposes a simple API for updating progress information from within job
 * handlers executed through {@link JobExecutorService}. The service automatically ties progress
 * updates to the current job (if any) and no-ops when progress tracking is disabled.
 */
@Service
@RequiredArgsConstructor
public class JobProgressService {

    private final TaskManager taskManager;

    /** Update the progress percentage for the current job. */
    public boolean updateProgress(int percent, String message) {
        String jobId = JobContextHolder.getJobId();
        if (jobId == null || !JobContextHolder.isProgressEnabled()) {
            return false;
        }
        return taskManager.updateProgress(jobId, percent, message);
    }

    /**
     * Create a simple tracker that can be used to report progress across a fixed number of steps.
     * When progress tracking is disabled for the current job, the returned tracker will be a
     * lightweight no-op implementation.
     */
    public JobProgressTracker tracker(int totalSteps) {
        return tracker(totalSteps, null);
    }

    /**
     * Create a tracker and optionally publish an initial message. Useful for multi-stage pipelines
     * where the initial state should be visible to clients.
     */
    public JobProgressTracker tracker(int totalSteps, String initialMessage) {
        String jobId = JobContextHolder.getJobId();
        boolean enabled = JobContextHolder.isProgressEnabled();

        if (jobId == null || !enabled || totalSteps <= 0) {
            return JobProgressTracker.disabled();
        }

        if (initialMessage != null && !initialMessage.isBlank()) {
            taskManager.updateProgress(jobId, 0, initialMessage);
        }

        return new JobProgressTracker(taskManager, jobId, totalSteps, true);
    }
}
