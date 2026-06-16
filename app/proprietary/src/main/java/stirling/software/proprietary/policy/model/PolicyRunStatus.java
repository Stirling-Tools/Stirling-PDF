package stirling.software.proprietary.policy.model;

/**
 * Lifecycle states of a {@link PolicyRun}.
 *
 * <p>{@code WAITING_FOR_INPUT} is modelled now so the engine and run shape support pausing a run
 * (e.g. a step that blocks for a human decision) without holding a thread; the resume handshake is
 * implemented in a later stage.
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
