package stirling.software.proprietary.service;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Lifecycle hooks for a user's AI document data on the Python engine.
 *
 * <p>Today: cleanup on logout. The engine also runs a TTL reaper that catches sessions ended
 * without a clean logout (tab close, JWT expiry, engine restart), so this service is the happy-
 * path purge, not a hard guarantee. All calls are best-effort: engine outages must not block the
 * user logging out.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUserDataService {

    private static final String PURGE_PATH = "/api/v1/documents/by-owner";

    private final AiEngineClient aiEngineClient;

    /**
     * Tell the engine to delete every collection owned by {@code userId} - vector chunks, page
     * text, ACL rows, and the owner row itself. Logged but never thrown: a failure here must not
     * stop the user logging out, and the engine's TTL reaper backstops any miss within ~24h.
     */
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
