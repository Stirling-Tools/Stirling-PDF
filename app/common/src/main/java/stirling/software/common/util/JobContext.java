package stirling.software.common.util;

/** Thread-local context for passing job ID across async boundaries */
public class JobContext {
    private static final ThreadLocal<String> CURRENT_JOB_ID = new ThreadLocal<>();

    public static void setJobId(String jobId) {
        CURRENT_JOB_ID.set(jobId);
    }

    public static String getJobId() {
        return CURRENT_JOB_ID.get();
    }

    public static void clear() {
        CURRENT_JOB_ID.remove();
    }
}
