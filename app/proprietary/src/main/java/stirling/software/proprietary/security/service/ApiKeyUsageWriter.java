package stirling.software.proprietary.security.service;

import java.time.Instant;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.ApiKeyDailyUsage;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

/**
 * Per-step transactional writes for {@link ApiKeyUsageRecorder}. Each method runs in its own
 * ({@code REQUIRES_NEW}) transaction so a unique-key clash when two requests race to insert the
 * day's first row rolls back only that failed insert - never an already-counted request or the
 * last-used stamp.
 */
@ApplicationScoped
@RequiredArgsConstructor
class ApiKeyUsageWriter {

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyDailyUsageRepository usageRepository;

    /** Bump today's tally if the row already exists; returns rows updated (0 if none yet). */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public int increment(Long apiKeyId, long epochDay) {
        return usageRepository.incrementIfPresent(apiKeyId, epochDay);
    }

    /**
     * Insert today's row with a count of 1. Flushes so a concurrent first-write's unique-key clash
     * surfaces here (returning false) instead of at commit; the caller then increments instead.
     */
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public boolean tryInsertFirstUse(Long apiKeyId, long epochDay) {
        try {
            usageRepository.saveAndFlush(new ApiKeyDailyUsage(apiKeyId, epochDay, 1));
            return true;
        } catch (PersistenceException raced) {
            return false;
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void stampLastUsed(Long apiKeyId) {
        apiKeyRepository
                .findByIdOptional(apiKeyId)
                .ifPresent(
                        key -> {
                            key.setLastUsedAt(Instant.now());
                            apiKeyRepository.save(key);
                        });
    }
}
