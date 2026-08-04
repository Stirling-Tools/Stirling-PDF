package stirling.software.SPDF.session;

import java.util.UUID;
import stirling.software.SPDF.model.domain.IDocumentModel;

/**
 * Represents a session for a single open document.
 * A session encapsulates the document model, selection state, undo history,
 * and other runtime information needed for editing.
 */
public interface IDocumentSession {
    
    /**
     * Returns the unique identifier for this session.
     * 
     * @return Session UUID
     */
    UUID getSessionId();
    
    /**
     * Returns the document model associated with this session.
     * 
     * @return The document model (read-only reference)
     */
    IDocumentModel getDocument();
    
    /**
     * Returns true if the document has been modified since last save.
     * 
     * @return True if dirty
     */
    boolean isDirty();
    
    /**
     * Marks the document as dirty or clean.
     * 
     * @param dirty The dirty state
     */
    void setDirty(boolean dirty);
    
    /**
     * Disposes this session, releasing all resources.
     * After disposal, the session should not be used.
     * 
     * @param reason The reason for disposal
     */
    void dispose(String reason);
    
    /**
     * Returns true if this session has been disposed.
     * 
     * @return True if disposed
     */
    boolean isDisposed();
}
