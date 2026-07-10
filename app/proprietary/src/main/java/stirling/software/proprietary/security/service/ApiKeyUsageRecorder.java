package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.time.ZoneOffset;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.ApiKeyDailyUsage;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

/**
 * Records per-key usage off the request thread. Kept a separate bean so the {@code @Async} proxy is
 * honoured (a self-invocation from the resolver would run inline). Best-effort: never fails a
 * request.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyUsageRecorder {

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyDailyUsageRepository usageRepository;

    /** Bump today's tally for the key and stamp last-used. */
    @Async("auditExecutor")
    @Transactional
    public void record(Long apiKeyId) {
        if (apiKeyId == null) {
            return;
        }
        try {
            long epochDay = Instant.now().atZone(ZoneOffset.UTC).toLocalDate().toEpochDay();
            if (usageRepository.incrementIfPresent(apiKeyId, epochDay) == 0) {
                try {
                    usageRepository.save(new ApiKeyDailyUsage(apiKeyId, epochDay, 1));
                } catch (DataIntegrityViolationException raced) {
                    // A concurrent first-write already inserted today's row; increment it instead
                    // of dropping this request's count.
                    usageRepository.incrementIfPresent(apiKeyId, epochDay);
                }
            }
            apiKeyRepository
                    .findById(apiKeyId)
                    .ifPresent(
                            key -> {
                                key.setLastUsedAt(Instant.now());
                                apiKeyRepository.save(key);
                            });
        } catch (Exception e) {
            log.debug("Failed to record API key usage for id={}", apiKeyId, e);
        }
    }
}
