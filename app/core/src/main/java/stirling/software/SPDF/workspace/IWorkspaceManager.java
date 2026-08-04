package stirling.software.SPDF.workspace;

import java.util.List;
import java.util.UUID;
import stirling.software.SPDF.session.IDocumentSession;

/**
 * Manages the workspace and all open document sessions.
 * This is the entry point for document operations in the application.
 */
public interface IWorkspaceManager {
    
    /**
     * Creates a new document session for the specified file.
     * 
     * @param filePath Path to the PDF file to open
     * @return The created document session
     * @throws Exception if the file cannot be opened
     */
    IDocumentSession openDocument(String filePath) throws Exception;
    
    /**
     * Closes an existing document session.
     * 
     * @param sessionId The session ID to close
     * @throws IllegalArgumentException if session not found
     */
    void closeDocument(UUID sessionId);
    
    /**
     * Gets a session by its ID.
     * 
     * @param sessionId The session ID
     * @return The session or null if not found
     */
    IDocumentSession getSession(UUID sessionId);
    
    /**
     * Gets the currently active session.
     * 
     * @return The active session or null if none
     */
    IDocumentSession getActiveSession();
    
    /**
     * Sets the active session.
     * 
     * @param sessionId The session ID to activate
     * @throws IllegalArgumentException if session not found
     */
    void setActiveSession(UUID sessionId);
    
    /**
     * Returns all open sessions.
     * 
     * @return List of all sessions
     */
    List<IDocumentSession> getAllSessions();
    
    /**
     * Returns the number of open sessions.
     * 
     * @return Session count
     */
    int getSessionCount();
    
    /**
     * Shuts down the workspace manager, closing all sessions.
     */
    void shutdown();
}
