package stirling.software.proprietary.service;

import java.io.IOException;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Lifecycle hooks for a user's AI document data on the Python engine.
 *
 * <p>Today: cleanup on logout. The engine also runs a TTL reaper that catches sessions ended
 * without a clean logout (tab close, JWT expiry, engine restart), so this service is the happy-path
 * purge, not a hard guarantee. Calls are fire-and-forget on a background thread (Spring's default
 * {@code @Async} executor) so an unavailable engine never delays the caller's response.
 */
@Slf4j
@Service
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
    @Async
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
