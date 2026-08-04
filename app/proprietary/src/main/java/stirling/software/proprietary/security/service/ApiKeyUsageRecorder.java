package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.Executor;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.inject.Named;

import lombok.extern.slf4j.Slf4j;

/**
 * Records per-key usage off the request thread, dispatching onto the MDC-propagating {@code
 * auditExecutor}. Best-effort: never fails a request. The actual writes go through {@link
 * ApiKeyUsageWriter} so each step commits in its own transaction and a first-write race can't drop
 * a count.
 */
@Slf4j
@ApplicationScoped
public class ApiKeyUsageRecorder {

    private final ApiKeyUsageWriter writer;
    private final Executor auditExecutor;

    @Inject
    public ApiKeyUsageRecorder(
            ApiKeyUsageWriter writer, @Named("auditExecutor") Executor auditExecutor) {
        this.writer = writer;
        this.auditExecutor = auditExecutor;
    }

    /** Bump today's tally for the key and stamp last-used. */
    public void record(Long apiKeyId) {
        if (apiKeyId == null) {
            return;
        }
        // Was Spring @Async("auditExecutor"); the hand-off is explicit now that there is no proxy.
        auditExecutor.execute(() -> recordUsage(apiKeyId));
    }

    private void recordUsage(Long apiKeyId) {
        try {
            long epochDay = Instant.now().atZone(ZoneOffset.UTC).toLocalDate().toEpochDay();
            // First writer of the day inserts the row; everyone else (and the loser of an insert
            // race) increments. Separate transactions mean a unique-key clash never rolls back an
            // already-counted request.
            if (writer.increment(apiKeyId, epochDay) == 0
                    && !firstUseInserted(apiKeyId, epochDay)) {
                writer.increment(apiKeyId, epochDay);
            }
            writer.stampLastUsed(apiKeyId);
        } catch (Exception e) {
            log.debug("Failed to record API key usage for id={}", apiKeyId, e);
        }
    }

    /**
     * Whether we inserted the day's first row. A lost insert race can surface either as a {@code
     * false} return or - when the failed flush marked the REQUIRES_NEW transaction rollback-only,
     * so its commit throws - as an exception; both mean "someone else inserted", so we treat any
     * failure as not-inserted and let the caller fall back to an increment rather than dropping the
     * count.
     */
    private boolean firstUseInserted(Long apiKeyId, long epochDay) {
        try {
            return writer.tryInsertFirstUse(apiKeyId, epochDay);
        } catch (RuntimeException raced) {
            return false;
        }
    }
}
