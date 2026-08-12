package stirling.software.proprietary.failure;

/**
 * The actions a {@link FailureKind} may declare. Both are incident dispositions: they change how
 * the event is shown and touch nothing else, which is what makes them valid for every kind
 * including {@link FailureKind#UNKNOWN}, and why there is no {@code APPROVE} yet.
 */
public enum FailureActionId {
    ACKNOWLEDGE,
    DISMISS
}
