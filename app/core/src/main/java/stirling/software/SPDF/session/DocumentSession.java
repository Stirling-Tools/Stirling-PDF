package stirling.software.SPDF.session;

import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import stirling.software.SPDF.event.SessionDisposedEvent;
import stirling.software.SPDF.model.domain.IDocumentChangeListener;
import stirling.software.SPDF.model.domain.IDocumentModel;

/**
 * Concrete implementation of a document session. Manages the lifecycle and state of a single open
 * document.
 */
public class DocumentSession implements IDocumentSession {

    private static final Logger logger = LoggerFactory.getLogger(DocumentSession.class);

    private final UUID sessionId;
    private final IDocumentModel document;
    private volatile boolean dirty;
    private volatile boolean disposed;
    private final CopyOnWriteArrayList<IDocumentChangeListener> listeners;

    /**
     * Creates a new document session.
     *
     * @param document The document model to manage
     */
    public DocumentSession(IDocumentModel document) {
        this.sessionId = UUID.randomUUID();
        this.document = document;
        this.dirty = false;
        this.disposed = false;
        this.listeners = new CopyOnWriteArrayList<>();

        // Register as a listener to track changes
        this.document.addChangeListener(new InternalChangeListener());

        logger.info("Created document session {} for document {}", sessionId, document.getName());
    }

    @Override
    public UUID getSessionId() {
        return sessionId;
    }

    @Override
    public IDocumentModel getDocument() {
        checkDisposed();
        return document;
    }

    @Override
    public boolean isDirty() {
        checkDisposed();
        return dirty;
    }

    @Override
    public void setDirty(boolean dirty) {
        checkDisposed();
        this.dirty = dirty;
        logger.debug("Session {} dirty state set to {}", sessionId, dirty);
    }

    @Override
    public void dispose(String reason) {
        if (disposed) {
            logger.warn("Session {} already disposed", sessionId);
            return;
        }

        logger.info("Disposing session {} - reason: {}", sessionId, reason);
        disposed = true;

        // Remove from document listeners
        document.removeChangeListener(listeners.get(0));

        // Fire disposal event (could be expanded to use EventBus)
        SessionDisposedEvent event = new SessionDisposedEvent(this, sessionId, reason);
        logger.debug("Fired session disposed event: {}", event);

        // Clear references to help garbage collection
        listeners.clear();
    }

    @Override
    public boolean isDisposed() {
        return disposed;
    }

    /**
     * Checks if the session has been disposed and throws an exception if so.
     *
     * @throws IllegalStateException if session is disposed
     */
    private void checkDisposed() {
        if (disposed) {
            throw new IllegalStateException("Session " + sessionId + " has been disposed");
        }
    }

    /** Internal listener to track document changes and update dirty state. */
    private class InternalChangeListener implements IDocumentChangeListener {

        @Override
        public void onStructureChanged(IDocumentModel document) {
            setDirty(true);
        }

        @Override
        public void onPageContentChanged(IDocumentModel document, int pageIndex) {
            setDirty(true);
        }

        @Override
        public void onMetadataChanged(IDocumentModel document) {
            setDirty(true);
        }
    }
}
