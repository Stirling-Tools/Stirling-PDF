package stirling.software.proprietary.service;

import java.io.IOException;

// TODO: Migration required - AiEngineClient (a collaborator, not yet migrated) still throws
// org.springframework.web.server.ResponseStatusException, so this import must stay until that file
// is converted. Once AiEngineClient throws jakarta.ws.rs.WebApplicationException, swap this catch.
import org.springframework.web.server.ResponseStatusException;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Lifecycle hooks for a user's AI document data on the Python engine.
 *
 * <p>Today: cleanup on logout. The engine also runs a TTL reaper that catches sessions ended
 * without a clean logout (tab close, JWT expiry, engine restart), so this service is the happy-path
 * purge, not a hard guarantee. Engine errors are logged and never propagated to the caller.
 */
@Slf4j
@ApplicationScoped
@RequiredArgsConstructor
public class AiUserDataService {

    private static final String PURGE_PATH = "/api/v1/documents/by-owner";

    private final AiEngineClient aiEngineClient;

    /**
     * Tell the engine to delete every collection owned by {@code userId}: vector chunks, page text,
     * ACL rows, and the owner row itself. Runs asynchronously so the calling thread (typically a
     * logout handler) returns immediately; engine errors are logged on the worker thread and never
     * propagated. The engine's TTL reaper backstops any miss within ~24h.
     */
    // TODO: Migration required - Spring's @Async ran this fire-and-forget on a managed executor so
    // an unavailable engine never delayed the logout response. Quarkus has no @Async; the method
    // now runs synchronously on the caller's thread. To restore off-thread dispatch, inject a
    // jakarta.enterprise.concurrent.ManagedExecutorService (or annotate the calling REST endpoint
    // with @io.smallrye.common.annotation.RunOnVirtualThread). Errors are still swallowed, so the
    // only behavioural change is that the caller now blocks on the engine call.
    public void purgeUserDocuments(String userId) {
        if (userId == null || userId.isBlank()) {
            log.debug("Skipping user document purge: no user id");
            return;
        }
        try {
            aiEngineClient.delete(PURGE_PATH, userId);
            log.debug("Requested document purge for user {}", userId);
        } catch (ResponseStatusException e) {
            log.warn("AI engine refused document purge for {}: {}", userId, e.getReason());
        } catch (IOException e) {
            log.warn("Failed to purge documents for {}: {}", userId, e.getMessage());
        }
    }
}
