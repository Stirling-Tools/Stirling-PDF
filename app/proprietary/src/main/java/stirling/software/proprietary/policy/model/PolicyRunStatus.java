package stirling.software.proprietary.policy.model;

/**
 * Lifecycle states of a {@link PolicyRun}. {@code WAITING_FOR_INPUT} models a thread-free pause;
 * the resume handshake lands in a later stage.
 */
public enum PolicyRunStatus {
    PENDING,
    RUNNING,
    WAITING_FOR_INPUT,
    COMPLETED,
    FAILED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED;
    }
}
