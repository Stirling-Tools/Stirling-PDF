package stirling.software.proprietary.failure;

/** Placement intent, not layout: the client promotes, knowing what it can actually run. */
public enum FailureActionSlot {

    /** The action that resolves the failure. At most one per kind. */
    RESOLUTION,

    /** Offered alongside the resolution, for a caller the resolution is not aimed at. */
    SECONDARY,

    /** Available but folded away: correct, rarely what anyone wants to press next. */
    OVERFLOW
}
