package stirling.software.proprietary.failure;

/**
 * Where a kind would like one of its actions to sit: the thing that fixes it, a supporting action,
 * or one folded away in a menu.
 *
 * <p>Intent, not layout. The client does the final promotion, because only it knows whether the
 * document is still in its own file store, and a resolution it cannot run is worth less than a
 * secondary action it can. Declaration order in {@link FailureKind} breaks a tie within a slot.
 */
public enum FailureActionSlot {

    /** The action that resolves the failure. At most one per kind is worth declaring here. */
    RESOLUTION,

    /** Offered alongside the resolution, for a caller the resolution is not aimed at. */
    SECONDARY,

    /** Available but folded away: correct, rarely the next thing anyone wants to press. */
    OVERFLOW
}
