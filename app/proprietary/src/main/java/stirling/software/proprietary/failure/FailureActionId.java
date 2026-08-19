package stirling.software.proprietary.failure;

import lombok.Getter;

/**
 * The actions a {@link FailureKind} may declare. Client actions are declared here rather than
 * invented per client, so the server keeps deciding what a kind offers, in what order and labelled
 * how.
 */
@Getter
public enum FailureActionId {

    /** No kind offers this any more, but rows already {@code ACKNOWLEDGED} must stay closable. */
    ACKNOWLEDGE(Execution.SERVER, "Acknowledge"),

    DISMISS(Execution.SERVER, "Dismiss"),

    /** Only the owner's client can resolve the id. */
    VIEW_FILE(Execution.CLIENT, "View file"),

    VIEW_IN_PROCESSOR(Execution.CLIENT, "View in processor");

    /** Dispatch refuses a {@code CLIENT} id, so this is enforced rather than merely documented. */
    public enum Execution {

        /** {@link FailureActionRegistry} requires a {@link FailureAction} bean for these. */
        SERVER,

        /**
         * Declared and rendered, never dispatched: the server has neither the file nor the tool.
         */
        CLIENT
    }

    private final Execution execution;

    /** English fallback, for a client with no translation for the label key. */
    private final String defaultLabel;

    FailureActionId(Execution execution, String defaultLabel) {
        this.execution = execution;
        this.defaultLabel = defaultLabel;
    }

    /** Also whether it can be dispatched. */
    public boolean runsOnServer() {
        return execution == Execution.SERVER;
    }
}
