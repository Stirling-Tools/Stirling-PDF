package stirling.software.SPDF.event;

import java.util.UUID;

/**
 * Event fired when a new document session is created.
 */
public class SessionCreatedEvent extends DocumentEvent {
    
    private final String documentName;
    private final String documentPath;
    
    /**
     * Creates a new session created event.
     * 
     * @param source The object that triggered the event
     * @param sessionId The ID of the newly created session
     * @param documentName The name of the document
     * @param documentPath The path to the document file
     */
    public SessionCreatedEvent(Object source, UUID sessionId, String documentName, String documentPath) {
        super(source, sessionId);
        this.documentName = documentName;
        this.documentPath = documentPath;
    }
    
    /**
     * Returns the name of the document.
     * 
     * @return Document name
     */
    public String getDocumentName() {
        return documentName;
    }
    
    /**
     * Returns the path to the document file.
     * 
     * @return Document path
     */
    public String getDocumentPath() {
        return documentPath;
    }
}
