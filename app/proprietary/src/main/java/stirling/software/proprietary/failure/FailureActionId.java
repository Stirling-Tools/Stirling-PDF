package stirling.software.proprietary.failure;

import lombok.Getter;

/**
 * The actions a {@link FailureKind} may declare. Client actions are declared here rather than
 * invented per client, so the server keeps deciding what a kind offers, in what order and labelled
 * how.
 */
@Getter
public enum FailureActionId {

    /**
     * Kept in the vocabulary for as long as any persisted row is {@code ACKNOWLEDGED}: such rows
     * must stay readable and closable whether or not any kind currently offers this.
     */
    ACKNOWLEDGE(Execution.SERVER, "Acknowledge"),

    DISMISS(Execution.SERVER, "Dismiss"),

    /** Run the failed operation again on the document the client still holds. */
    RETRY(Execution.CLIENT, "Retry"),

    /** Ask the owner for the password, unlock the document in their client, then retry. */
    DECRYPT_AND_RETRY(Execution.CLIENT, "Decrypt and retry"),

    /** Open the document behind the incident, in whichever client can resolve its id. */
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
