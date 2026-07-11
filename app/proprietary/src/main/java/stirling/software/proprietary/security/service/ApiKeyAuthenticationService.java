package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

/**
 * Resolves an incoming {@code X-API-KEY} to its owning user and records per-key usage. Depends only
 * on repositories (never {@code UserService}) so {@code UserService} can delegate here without a
 * bean cycle.
 *
 * <p>Resolution order: the multi-key {@code api_keys} table first (by hash), then the legacy
 * per-user {@code users.apiKey} column. Legacy keys therefore keep working unchanged. Every key is
 * personal and authenticates as its owner with the owner's authorities.
 */
@Service
@RequiredArgsConstructor
public class ApiKeyAuthenticationService {

    /**
     * MDC key that carries the resolved key's label into audit events so the processor's Documents
     * feed can attribute a document to the specific key. Set by the auth filters (both flavors),
     * read by {@code CustomAuditEventRepository}.
     */
    public static final String AUDIT_LABEL_MDC_KEY = "apiKeyLabel";

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyUsageRecorder usageRecorder;
    private final UserRepository userRepository;

    /** The user a raw key authenticates as, or empty if it matches no active key. */
    public Optional<User> resolveUser(String rawKey) {
        return authenticate(rawKey).map(ApiKeyAuthentication::user);
    }

    /**
     * Resolve a raw key, recording usage as a side effect. Returns the owning user, a display label
     * for the resolved key ({@code null} for the legacy per-user key), and the owner's authorities.
     */
    public Optional<ApiKeyAuthentication> authenticate(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return Optional.empty();
        }

        ApiKey key = apiKeyRepository.findByKeyHash(ApiKeyHasher.hash(rawKey)).orElse(null);
        if (key != null) {
            if (!key.isActive()) {
                return Optional.empty();
            }
            User owner = userRepository.findById(key.getOwnerUserId()).orElse(null);
            if (owner == null || !owner.isEnabled()) {
                return Optional.empty();
            }
            usageRecorder.record(key.getId());
            return Optional.of(
                    new ApiKeyAuthentication(owner, auditLabel(key), owner.getAuthorities()));
        }

        // Legacy single per-user key: keep working, always a personal key for its user.
        return userRepository
                .findByApiKey(rawKey)
                .filter(User::isEnabled)
                .map(user -> new ApiKeyAuthentication(user, null, user.getAuthorities()));
    }

    /** "Production ingest (sk_a1b2c3d4)" - shown against API-sourced docs in the processor feed. */
    private static String auditLabel(ApiKey key) {
        return key.getName() + " (" + key.getPrefix() + ")";
    }

    /**
     * Revoke the {@code api_keys} row that mirrors a given raw key, if any. Called when the legacy
     * per-user key is rotated so the migrated shadow row can't keep authenticating the old secret.
     */
    @Transactional
    public void revokeMigratedKey(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return;
        }
        apiKeyRepository
                .findByKeyHash(ApiKeyHasher.hash(rawKey))
                .filter(ApiKey::isActive)
                .ifPresent(
                        k -> {
                            k.setEnabled(false);
                            k.setRevokedAt(Instant.now());
                            apiKeyRepository.save(k);
                        });
    }

    /**
     * A resolved key: the user, an optional processor-feed label, and the authorities to run as.
     */
    public record ApiKeyAuthentication(
            User user, String auditLabel, Collection<? extends GrantedAuthority> authorities) {}
}
