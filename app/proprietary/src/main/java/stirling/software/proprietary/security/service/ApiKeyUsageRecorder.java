package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.time.ZoneOffset;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Records per-key usage off the request thread. Kept a separate bean so the {@code @Async} proxy is
 * honoured (a self-invocation from the resolver would run inline). Best-effort: never fails a
 * request. The actual writes go through {@link ApiKeyUsageWriter} so each step commits in its own
 * transaction and a first-write race can't drop a count.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyUsageRecorder {

    private final ApiKeyUsageWriter writer;

    /** Bump today's tally for the key and stamp last-used. */
    @Async("auditExecutor")
    public void record(Long apiKeyId) {
        if (apiKeyId == null) {
            return;
        }
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
