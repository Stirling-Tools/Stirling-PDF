package stirling.software.proprietary.failure;

/**
 * Where in a run's life the failure happened: reading the document ({@code INPUT}), a tool step or
 * the engine ({@code INTERNAL}), delivery ({@code OUTPUT}), a gate refusing it ({@code BLOCKED}),
 * or never admitted ({@code NEVER_RAN}).
 *
 * <p>All five declared up front so a later kind needs no enum change, which would strand the value
 * already snapshotted on existing rows.
 */
public enum FailureStage {
    INPUT,
    INTERNAL,
    OUTPUT,
    BLOCKED,
    NEVER_RAN
}
