package stirling.software.proprietary.service;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.DocparseCapabilityServiceInterface;
import stirling.software.proprietary.model.docparse.DocparseCapabilities;

import tools.jackson.databind.ObjectMapper;

/**
 * Probes the engine's {@code GET /api/v1/docparse/capabilities} and caches the answer for 5
 * minutes. Reports "addon absent" when the AI engine is disabled or the probe fails, so callers can
 * always route to the basic tier without special-casing errors.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocparseCapabilityService implements DocparseCapabilityServiceInterface {

    private static final String CAPABILITIES_ENDPOINT = "/api/v1/docparse/capabilities";
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final AiEngineClient aiEngineClient;
    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;

    private record Snapshot(
            DocparseCapabilities capabilities, boolean engineReachable, Instant fetchedAt) {}

    private volatile Snapshot snapshot;
    private final AtomicBoolean refreshing = new AtomicBoolean();

    /** The cached capabilities, refreshed synchronously when stale. */
    public DocparseCapabilities capabilities() {
        return freshSnapshot().capabilities();
    }

    /** Whether the last capability probe reached the engine. */
    public boolean isEngineReachable() {
        Snapshot current = snapshot;
        return current != null && current.engineReachable();
    }

    /** {@code refresh(true)} bypasses the cache and re-probes the engine now. */
    public DocparseCapabilities refresh(boolean force) {
        if (!force) {
            return capabilities();
        }
        Snapshot fresh = fetch();
        snapshot = fresh;
        return fresh.capabilities();
    }

    /**
     * Non-blocking read for app-config: returns the last known value and kicks off a background
     * refresh when stale, so a slow/unreachable engine never delays page load.
     */
    @Override
    public boolean isAdvancedInstalled() {
        Snapshot current = snapshot;
        if (current == null || isStale(current)) {
            triggerAsyncRefresh();
        }
        return current != null && current.capabilities().advancedInstalled();
    }

    private Snapshot freshSnapshot() {
        Snapshot current = snapshot;
        if (current != null && !isStale(current)) {
            return current;
        }
        Snapshot fresh = fetch();
        snapshot = fresh;
        return fresh;
    }

    private void triggerAsyncRefresh() {
        if (!refreshing.compareAndSet(false, true)) {
            return;
        }
        Thread.ofVirtual()
                .name("docparse-capability-refresh")
                .start(
                        () -> {
                            try {
                                snapshot = fetch();
                            } finally {
                                refreshing.set(false);
                            }
                        });
    }

    private Snapshot fetch() {
        if (!applicationProperties.getAiEngine().isEnabled()) {
            return new Snapshot(
                    DocparseCapabilities.absent("AI engine is disabled"), false, Instant.now());
        }
        try {
            String json = aiEngineClient.get(CAPABILITIES_ENDPOINT, null);
            DocparseCapabilities capabilities =
                    objectMapper.readValue(json, DocparseCapabilities.class);
            return new Snapshot(capabilities, true, Instant.now());
        } catch (Exception e) {
            log.debug("DocParse capability probe failed: {}", e.getMessage());
            return new Snapshot(
                    DocparseCapabilities.absent("Capability probe failed: " + e.getMessage()),
                    false,
                    Instant.now());
        }
    }

    private static boolean isStale(Snapshot current) {
        return current.fetchedAt().plus(CACHE_TTL).isBefore(Instant.now());
    }
}
