package stirling.software.common.util;

/** Thread-local context for passing job ID and owner across async boundaries */
public class JobContext {
    private static final ThreadLocal<String> CURRENT_JOB_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_OWNER = new ThreadLocal<>();

    public static void setJobId(String jobId) {
        CURRENT_JOB_ID.set(jobId);
    }

    public static String getJobId() {
        return CURRENT_JOB_ID.get();
    }

    public static void setOwner(String owner) {
        CURRENT_OWNER.set(owner);
    }

    public static String getOwner() {
        return CURRENT_OWNER.get();
    }

    public static void clear() {
        CURRENT_JOB_ID.remove();
        CURRENT_OWNER.remove();
    }
}
