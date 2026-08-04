package stirling.software.SPDF.event;

import java.util.EventObject;
import java.util.UUID;

/**
 * Base event class for all document-related events in the system. Provides common properties like
 * session ID and timestamp.
 */
public abstract class DocumentEvent extends EventObject {

    private final UUID sessionId;
    private final long timestamp;

    /**
     * Creates a new document event.
     *
     * @param source The object that triggered the event
     * @param sessionId The ID of the document session this event relates to
     */
    public DocumentEvent(Object source, UUID sessionId) {
        super(source);
        this.sessionId = sessionId;
        this.timestamp = System.currentTimeMillis();
    }

    /**
     * Returns the session ID associated with this event.
     *
     * @return The session UUID
     */
    public UUID getSessionId() {
        return sessionId;
    }

    /**
     * Returns the timestamp when this event was created.
     *
     * @return Timestamp in milliseconds since epoch
     */
    public long getTimestamp() {
        return timestamp;
    }
}
