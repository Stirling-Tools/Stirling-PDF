package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

/**
 * Inserts the shadow {@code api_keys} row that mirrors a user's legacy {@code users.apiKey} in its
 * OWN ({@code REQUIRES_NEW}) transaction. Kept a separate bean so the write is isolated from the
 * caller's listing transaction: when two concurrent first-loads race to insert the same hash, the
 * loser's unique-key clash rolls back only this insert instead of poisoning the caller's
 * transaction (on Postgres a failed statement aborts the whole transaction). The {@code
 * DataIntegrityViolationException} is left to propagate so the caller can treat it as "already
 * migrated".
 */
@Component
@RequiredArgsConstructor
class ApiKeyLegacyMigrator {

    private final ApiKeyRepository apiKeyRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insertMigratedKey(ApiKey key) {
        apiKeyRepository.saveAndFlush(key);
    }
}
