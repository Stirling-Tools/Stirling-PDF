package stirling.software.SPDF.workspace;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import stirling.software.SPDF.event.SessionCreatedEvent;
import stirling.software.SPDF.model.domain.IDocumentModel;
import stirling.software.SPDF.session.DocumentSession;
import stirling.software.SPDF.session.IDocumentSession;

/**
 * Concrete implementation of the workspace manager.
 * Manages all open document sessions in the application.
 */
@Service
public class WorkspaceManager implements IWorkspaceManager {
    
    private static final Logger logger = LoggerFactory.getLogger(WorkspaceManager.class);
    
    private final Map<UUID, IDocumentSession> sessions;
    private volatile UUID activeSessionId;
    
    public WorkspaceManager() {
        this.sessions = new ConcurrentHashMap<>();
        this.activeSessionId = null;
        logger.info("WorkspaceManager initialized");
    }
    
    @Override
    public IDocumentSession openDocument(String filePath) throws Exception {
        if (filePath == null || filePath.trim().isEmpty()) {
            throw new IllegalArgumentException("File path cannot be empty");
        }
        
        Path path = Path.of(filePath);
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("File does not exist: " + filePath);
        }
        
        // TODO: Phase 1B - Implement actual document loading via SynchronizationService
        // For now, we create a placeholder to demonstrate the architecture
        IDocumentModel document = createPlaceholderDocument(path);
        
        IDocumentSession session = new DocumentSession(document);
        sessions.put(session.getSessionId(), session);
        
        // Set as active if it's the first session
        if (activeSessionId == null) {
            activeSessionId = session.getSessionId();
        }
        
        logger.info("Opened document {} in session {}", filePath, session.getSessionId());
        
        // Fire session created event
        SessionCreatedEvent event = new SessionCreatedEvent(
            this, 
            session.getSessionId(), 
            document.getName(), 
            filePath
        );
        logger.debug("Fired session created event: {}", event);
        
        return session;
    }
    
    @Override
    public void closeDocument(UUID sessionId) {
        IDocumentSession session = sessions.remove(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("Session not found: " + sessionId);
        }
        
        logger.info("Closing session {}", sessionId);
        session.dispose("user_closed");
        
        // Update active session if needed
        if (sessionId.equals(activeSessionId)) {
            activeSessionId = sessions.isEmpty() ? null : sessions.keySet().iterator().next();
            logger.debug("Active session changed to {}", activeSessionId);
        }
    }
    
    @Override
    public IDocumentSession getSession(UUID sessionId) {
        IDocumentSession session = sessions.get(sessionId);
        if (session != null && session.isDisposed()) {
            sessions.remove(sessionId);
            return null;
        }
        return session;
    }
    
    @Override
    public IDocumentSession getActiveSession() {
        if (activeSessionId == null) {
            return null;
        }
        return getSession(activeSessionId);
    }
    
    @Override
    public void setActiveSession(UUID sessionId) {
        IDocumentSession session = getSession(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("Session not found: " + sessionId);
        }
        if (session.isDisposed()) {
            throw new IllegalStateException("Session is disposed: " + sessionId);
        }
        
        activeSessionId = sessionId;
        logger.debug("Set active session to {}", sessionId);
    }
    
    @Override
    public List<IDocumentSession> getAllSessions() {
        List<IDocumentSession> activeSessions = new ArrayList<>();
        for (IDocumentSession session : sessions.values()) {
            if (!session.isDisposed()) {
                activeSessions.add(session);
            }
        }
        return Collections.unmodifiableList(activeSessions);
    }
    
    @Override
    public int getSessionCount() {
        return getAllSessions().size();
    }
    
    @Override
    public void shutdown() {
        logger.info("Shutting down WorkspaceManager, closing {} sessions", sessions.size());
        
        List<UUID> sessionIds = new ArrayList<>(sessions.keySet());
        for (UUID sessionId : sessionIds) {
            try {
                closeDocument(sessionId);
            } catch (Exception e) {
                logger.error("Error closing session {}: {}", sessionId, e.getMessage());
            }
        }
        
        sessions.clear();
        activeSessionId = null;
        logger.info("WorkspaceManager shut down complete");
    }
    
    /**
     * Creates a placeholder document model for demonstration.
     * TODO: Replace with actual PDFBox-based implementation in Phase 1B.
     * 
     * @param path The file path
     * @return A placeholder document model
     */
    private IDocumentModel createPlaceholderDocument(Path path) {
        // This is a temporary placeholder until we implement the synchronization layer
        // In Phase 1B, this will load the actual PDF using PDFBox and create a real domain model
        throw new UnsupportedOperationException(
            "Document loading not yet implemented. This will be available in Phase 1B."
        );
    }
}
