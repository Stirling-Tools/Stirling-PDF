package stirling.software.SPDF.event;

import java.util.UUID;

/**
 * Event fired when a document session is disposed.
 */
public class SessionDisposedEvent extends DocumentEvent {
    
    private final String reason;
    
    /**
     * Creates a new session disposed event.
     * 
     * @param source The object that triggered the event
     * @param sessionId The ID of the disposed session
     * @param reason The reason for disposal (e.g., "user_closed", "error", "shutdown")
     */
    public SessionDisposedEvent(Object source, UUID sessionId, String reason) {
        super(source, sessionId);
        this.reason = reason;
    }
    
    /**
     * Returns the reason for session disposal.
     * 
     * @return Disposal reason
     */
    public String getReason() {
        return reason;
    }
}
