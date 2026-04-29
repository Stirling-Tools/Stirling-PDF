package stirling.software.common.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobProgress;
import stirling.software.common.util.JobContext;

/**
 * Lets long-running operations publish progress that clients can poll via {@code GET
 * /api/v1/general/job/{jobId}}.
 *
 * <p>Resolves the current job id from {@link JobContext} (populated by {@link JobExecutorService}).
 * When no job is in context — e.g. synchronous calls or code paths that aren't routed through
 * {@code @AutoJobPostMapping} — updates are silently dropped, so callers can report progress
 * unconditionally without guarding on async mode.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JobProgressService {

    private final TaskManager taskManager;

    /** Report coarse progress with just a percentage and message. */
    public void report(int percent, String message) {
        publish(clampPercent(percent), message, null, null);
    }

    /**
     * Report step-based progress. Percent is computed from {@code current/total} and rounded down
     * to 99 until completion, so clients don't see 100% before the job is actually complete.
     */
    public void report(int current, int total, String message) {
        int percent;
        if (total <= 0) {
            percent = 0;
        } else {
            percent = (int) Math.min(99, Math.floor(100.0 * current / total));
        }
        publish(percent, message, current, total);
    }

    private void publish(int percent, String message, Integer current, Integer total) {
        String jobId = JobContext.getJobId();
        if (jobId == null) {
            log.warn(
                    "JobProgressService.report({}% - {}) called without a job in context — dropping."
                            + " This call is outside any @AutoJobPostMapping async flow.",
                    percent, message);
            return;
        }
        JobProgress progress =
                JobProgress.builder()
                        .percent(percent)
                        .message(message)
                        .current(current)
                        .total(total)
                        .build();
        taskManager.updateProgress(jobId, progress);
        log.info("Progress for job {}: {}% - {}", jobId, percent, message);
    }

    private static int clampPercent(int percent) {
        if (percent < 0) return 0;
        if (percent > 100) return 100;
        return percent;
    }
}
