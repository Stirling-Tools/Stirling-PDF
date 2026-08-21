package stirling.software.proprietary.policy.progress;

/**
 * Receives live progress as a pipeline run executes (SSE stream, job notes, or both). Step indices
 * are 1-based. All methods default to no-ops.
 */
public interface PolicyProgressListener {

    PolicyProgressListener NOOP = new PolicyProgressListener() {};

    default void onStepStart(int stepIndex, int stepCount, String operation) {}

    default void onStepComplete(int stepIndex, int stepCount, String operation) {}

    /** Keep-alive tick so downstream connections can detect disconnects promptly. */
    default void onHeartbeat() {}
}
