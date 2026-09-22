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

    /**
     * Runs the failed step again. A browser holding the document opens the tool with it loaded, so
     * the user sees the settings first; a smart folder's document is re-run by the server, which is
     * the only side that can reach it.
     */
    OPEN_IN_TOOL(Execution.EITHER, "Retry"),

    /** Unlocks the document with a password the owner supplies, then re-runs. */
    DECRYPT(Execution.EITHER, "Unlock"),

    /** Repairs the document, then re-runs. */
    REPAIR(Execution.EITHER, "Repair"),

    /** Open the document behind the incident, in whichever client can resolve its id. */
    VIEW_FILE(Execution.CLIENT, "View file"),

    VIEW_IN_PROCESSOR(Execution.CLIENT, "View in processor");

    /** Dispatch refuses an id that does not run on the server, so this is enforced. */
    public enum Execution {

        /** {@link FailureActionRegistry} requires a {@link FailureAction} bean for these. */
        SERVER,

        /**
         * Declared and rendered, never dispatched: the server has neither the file nor the tool.
         */
        CLIENT,

        /**
         * Per row, not declared here: a reader holding the file acts on it themselves; a document
         * only the server can reach is acted on there. See {@link #executionFor(boolean)}.
         */
        EITHER
    }

    private final Execution execution;

    /** English fallback, for a client with no translation for the label key. */
    private final String defaultLabel;

    FailureActionId(Execution execution, String defaultLabel) {
        this.execution = execution;
        this.defaultLabel = defaultLabel;
    }

    /**
     * Where this action runs for a document in the given place, which is what the client is told
     * and what dispatch is checked against. Only {@link Execution#EITHER} depends on the argument.
     */
    public Execution executionFor(boolean inSmartFolder) {
        if (execution != Execution.EITHER) {
            return execution;
        }
        return inSmartFolder ? Execution.SERVER : Execution.CLIENT;
    }

    /** Whether a handler bean must exist: true for anything that can ever be dispatched. */
    public boolean canRunOnServer() {
        return execution != Execution.CLIENT;
    }
}
