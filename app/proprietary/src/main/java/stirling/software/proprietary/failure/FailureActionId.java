package stirling.software.proprietary.failure;

import lombok.Getter;

/**
 * The actions a {@link FailureKind} may declare, and which side of the wire runs each one.
 *
 * <p>The dispositions are the server's: they change how the event is shown and touch nothing else,
 * which is what makes them valid for every kind including {@link FailureKind#UNKNOWN}. Everything
 * else is the client's, because the server holds an opaque id for the document and nothing more.
 *
 * <p>Client actions are still declared here rather than invented by each client, so the server
 * keeps deciding what a kind offers, in what order and under what label.
 */
@Getter
public enum FailureActionId {

    /**
     * "Seen, and I own it." No kind offers this any more, but rows shipped before that are already
     * {@code ACKNOWLEDGED} and must stay readable and closable.
     */
    ACKNOWLEDGE(Execution.SERVER, "Acknowledge"),

    /** "No remediation will happen; close it." See {@link DismissAction}. */
    DISMISS(Execution.SERVER, "Dismiss"),

    /** Open the document this incident is about. Only its owner's client can resolve the id. */
    VIEW_FILE(Execution.CLIENT, "View file"),

    /** Open the run behind it, for whoever reviews the team rather than owns the document. */
    VIEW_IN_PROCESSOR(Execution.CLIENT, "View in processor");

    /**
     * Which side of the wire runs the action. The dispatch endpoint refuses a {@code CLIENT} id, so
     * "the client does this one" is enforced rather than merely documented.
     */
    public enum Execution {

        /**
         * Dispatchable, and {@link FailureActionRegistry} requires a {@link FailureAction} bean.
         */
        SERVER,

        /**
         * Declared and rendered, never dispatched: the server has neither the file nor the tool.
         */
        CLIENT
    }

    private final Execution execution;

    /** English fallback, used when the client has no translation for the action's label key. */
    private final String defaultLabel;

    FailureActionId(Execution execution, String defaultLabel) {
        this.execution = execution;
        this.defaultLabel = defaultLabel;
    }

    /** Whether the server runs it itself, which is also whether it can be dispatched. */
    public boolean runsOnServer() {
        return execution == Execution.SERVER;
    }
}
