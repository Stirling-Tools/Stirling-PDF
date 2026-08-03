package stirling.software.proprietary.failure;

/**
 * Which surface produced the failure. Every PR 1 row is {@link #PROCESSOR} (the policy engine);
 * {@link #EDITOR} reporting is PR 2 and {@link #API} is later still.
 */
public enum FailureOrigin {
    EDITOR,
    PROCESSOR,
    API
}
