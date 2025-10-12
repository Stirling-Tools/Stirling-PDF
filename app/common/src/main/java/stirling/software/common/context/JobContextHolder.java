package stirling.software.common.context;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * Holds contextual information for the currently executing job. Backed by a {@link ThreadLocal} so
 * worker threads can retrieve the job ID and progress tracking preference while processing
 * asynchronous work dispatched by {@link stirling.software.common.service.JobExecutorService
 * JobExecutorService}.
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class JobContextHolder {

    private static final ThreadLocal<String> JOB_ID = new ThreadLocal<>();
    private static final ThreadLocal<Boolean> PROGRESS_ENABLED = new ThreadLocal<>();

    /** Store context for the current thread. */
    public static void setContext(String jobId, boolean progressEnabled) {
        if (jobId == null) {
            clear();
            return;
        }
        JOB_ID.set(jobId);
        PROGRESS_ENABLED.set(progressEnabled);
    }

    /** Get the job ID bound to the current thread, or {@code null} if none. */
    public static String getJobId() {
        return JOB_ID.get();
    }

    /** Whether progress tracking is enabled for the current job (defaults to {@code false}). */
    public static boolean isProgressEnabled() {
        Boolean enabled = PROGRESS_ENABLED.get();
        return enabled != null && enabled;
    }

    /** Remove all context associated with the current thread. */
    public static void clear() {
        JOB_ID.remove();
        PROGRESS_ENABLED.remove();
    }
}
