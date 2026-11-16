package stirling.software.proprietary.workflow.notification;

/** The owner finalized a signing session. {@code sessionId} is the public session UUID. */
public record SigningCompletionEvent(String sessionId) {}
