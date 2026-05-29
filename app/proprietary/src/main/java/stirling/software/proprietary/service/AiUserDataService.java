package stirling.software.proprietary.service;

import java.io.IOException;

import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Lifecycle hooks for a user's AI/RAG data on the Python engine.
 *
 * <p>Today: cleanup on logout. The engine also runs a TTL reaper that catches sessions ended
 * without a clean logout (tab close, JWT expiry, engine restart), so this service is the happy-path
 * purge, not a hard guarantee. All calls are best-effort: engine outages must not block the user
 * logging out.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUserDataService {

    private static final String PURGE_PATH = "/api/v1/documents/by-owner";

    private final AiEngineClient aiEngineClient;

    /**
     * Tell the engine to delete every personal-doc collection owned by {@code userId}. Logged but
     * never thrown: a failure here must not stop the user logging out, and the engine's TTL reaper
     * backstops any miss within ~24h.
     */
    public void purgeRagContent(String userId) {
        if (userId == null || userId.isBlank()) {
            log.debug("Skipping RAG purge: no user id");
            return;
        }
        try {
            aiEngineClient.delete(PURGE_PATH, userId);
            log.debug("Requested RAG purge for user {}", userId);
        } catch (ResponseStatusException e) {
            log.warn("AI engine refused RAG purge for {}: {}", userId, e.getReason());
        } catch (IOException e) {
            log.warn("Failed to purge RAG content for {}: {}", userId, e.getMessage());
        }
    }
}
