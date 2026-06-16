package stirling.software.proprietary.policy.progress;

/**
 * Receives live progress as a pipeline run executes. Implementations forward to an SSE stream,
 * write job notes for polling, or both. Step indices are 1-based.
 *
 * <p>All methods default to no-ops so callers implement only what they surface.
 */
public interface PolicyProgressListener {

    /** A listener that ignores all progress. */
    PolicyProgressListener NOOP = new PolicyProgressListener() {};

    /** Called immediately before step {@code stepIndex} of {@code stepCount} begins. */
    default void onStepStart(int stepIndex, int stepCount, String operation) {}

    /** Called immediately after step {@code stepIndex} of {@code stepCount} completes. */
    default void onStepComplete(int stepIndex, int stepCount, String operation) {}

    /** Called on a keep-alive tick so downstream connections can detect disconnects promptly. */
    default void onHeartbeat() {}
}
