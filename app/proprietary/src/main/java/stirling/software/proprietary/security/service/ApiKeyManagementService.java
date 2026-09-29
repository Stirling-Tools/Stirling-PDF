package stirling.software.proprietary.security.service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.model.api.apikey.CreatedApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeysResponse;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKey;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.ApiKeyDailyUsageRepository;
import stirling.software.proprietary.security.repository.ApiKeyRepository;

/**
 * Portal-facing CRUD for named, personal API keys: lists, creates, and revokes the caller's own
 * keys. Every key belongs to exactly one user and authenticates as that user; there is no sharing.
 *
 * <p>Every pre-existing single {@code users.apiKey} is lazily represented as a key owned by that
 * user, so historic keys list uniformly.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiKeyManagementService {

    private static final DateTimeFormatter CREATED_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter LAST_USED_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneOffset.UTC);
    private static final int MONTH_WINDOW_DAYS = 30;

    /** Bounds a key name so it can't bloat storage or the audit/processor feed. */
    private static final int MAX_NAME_LENGTH = 100;

    /** Caps active keys per user so key creation can't be used to multiply rate-limit budget. */
    private static final int MAX_ACTIVE_KEYS_PER_USER = 50;

    private final ApiKeyRepository apiKeyRepository;
    private final ApiKeyDailyUsageRepository usageRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final ApiKeyLegacyMigrator legacyMigrator;

    /** All keys the caller owns. */
    @Transactional
    public PortalApiKeysResponse listVisibleKeys() {
        User caller = requireCaller();
        migrateLegacyKey(caller);

        List<ApiKey> visible =
                apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(caller.getId());

        // Batch usage for all keys into three queries rather than two-per-key (avoids N+1).
        long today = Instant.now().atZone(ZoneOffset.UTC).toLocalDate().toEpochDay();
        List<Long> ids = visible.stream().map(ApiKey::getId).toList();
        Map<Long, Long> todayById = new HashMap<>();
        Map<Long, Long> monthById = new HashMap<>();
        Map<Long, Long> totalById = new HashMap<>();
        if (!ids.isEmpty()) {
            usageRepository
                    .countForDayByIds(ids, today)
                    .forEach(r -> todayById.put(r.getApiKeyId(), r.getTotal()));
            usageRepository
                    .sumSinceByIds(ids, today - (MONTH_WINDOW_DAYS - 1))
                    .forEach(r -> monthById.put(r.getApiKeyId(), r.getTotal()));
            usageRepository
                    .sumSinceByIds(ids, Long.MIN_VALUE)
                    .forEach(r -> totalById.put(r.getApiKeyId(), r.getTotal()));
        }

        List<PortalApiKeyDto> keys =
                visible.stream()
                        .map(
                                k ->
                                        toDto(
                                                k,
                                                zeroIfNull(todayById.get(k.getId())),
                                                zeroIfNull(monthById.get(k.getId())),
                                                zeroIfNull(totalById.get(k.getId()))))
                        .toList();
        return PortalApiKeysResponse.builder().keys(keys).build();
    }

    private static long zeroIfNull(Long value) {
        return value == null ? 0L : value;
    }

    /** Create a personal key and return its one-time secret. */
    @Transactional
    public CreatedApiKeyDto createKey(CreateApiKeyRequest request) {
        User caller = requireCaller();
        String name = request == null ? null : request.name();
        if (name == null || name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Key name is required");
        }
        if (name.trim().length() > MAX_NAME_LENGTH) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Key name must be " + MAX_NAME_LENGTH + " characters or fewer");
        }
        long activeOwned =
                apiKeyRepository.findByOwnerUserIdOrderByCreatedAtDesc(caller.getId()).stream()
                        .filter(ApiKey::isActive)
                        .count();
        if (activeOwned >= MAX_ACTIVE_KEYS_PER_USER) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "You have reached the maximum of "
                            + MAX_ACTIVE_KEYS_PER_USER
                            + " active API keys; revoke one before creating another");
        }

        String rawKey = ApiKeyHasher.generateRawKey();
        ApiKey saved =
                apiKeyRepository.save(
                        ApiKey.builder()
                                .name(name.trim())
                                .keyHash(ApiKeyHasher.hash(rawKey))
                                .prefix(ApiKeyHasher.displayPrefix(rawKey))
                                .ownerUserId(caller.getId())
                                .enabled(true)
                                .createdAt(Instant.now())
                                .build());

        return CreatedApiKeyDto.builder().key(toDto(saved, 0L, 0L, 0L)).secret(rawKey).build();
    }

    /** Soft-revoke a key the caller owns; also clears the legacy column if it is that key. */
    @Transactional
    public void revokeKey(Long id) {
        User caller = requireCaller();
        ApiKey key =
                apiKeyRepository
                        .findById(id)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No key"));
        if (!key.getOwnerUserId().equals(caller.getId())) {
            // Not-found rather than forbidden so a caller can't probe other users' key ids.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No key");
        }
        key.setEnabled(false);
        key.setRevokedAt(Instant.now());
        apiKeyRepository.save(key);
        clearLegacyColumnIfMatches(key);
    }

    /** Represent a user's pre-existing single key as a row so it lists uniformly. */
    private void migrateLegacyKey(User user) {
        String legacy = user.getApiKey();
        if (legacy == null || legacy.isBlank()) {
            return;
        }
        String hash = ApiKeyHasher.hash(legacy);
        if (apiKeyRepository.existsByKeyHash(hash)) {
            return;
        }
        try {
            // Insert in its own transaction so a concurrent-insert clash can't poison this
            // listing transaction (see ApiKeyLegacyMigrator).
            legacyMigrator.insertMigratedKey(
                    ApiKey.builder()
                            .name("Default key")
                            .keyHash(hash)
                            .prefix(ApiKeyHasher.displayPrefix(legacy))
                            .ownerUserId(user.getId())
                            .enabled(true)
                            .createdAt(Instant.now())
                            .build());
        } catch (DataIntegrityViolationException alreadyMigrated) {
            // A concurrent first-load won the race and inserted the same hash; that's fine.
            log.debug("Legacy key already migrated concurrently for user {}", user.getId());
        }
    }

    /**
     * If a revoked key is the owner's legacy {@code users.apiKey}, null it so it stops resolving.
     */
    private void clearLegacyColumnIfMatches(ApiKey key) {
        userRepository
                .findById(key.getOwnerUserId())
                .ifPresent(
                        owner -> {
                            String legacy = owner.getApiKey();
                            if (legacy != null
                                    && ApiKeyHasher.hash(legacy).equals(key.getKeyHash())) {
                                owner.setApiKey(null);
                                userRepository.save(owner);
                            }
                        });
    }

    private PortalApiKeyDto toDto(ApiKey key, long usageToday, long usageMonth, long usageTotal) {
        return PortalApiKeyDto.builder()
                .id(String.valueOf(key.getId()))
                .name(key.getName())
                .prefix(key.getPrefix())
                .created(
                        key.getCreatedAt() == null ? "" : CREATED_FORMAT.format(key.getCreatedAt()))
                .lastUsed(
                        key.getLastUsedAt() == null
                                ? "Never"
                                : LAST_USED_FORMAT.format(key.getLastUsedAt()))
                .status(key.isActive() ? "active" : "revoked")
                .usageToday(usageToday)
                .usageMonth(usageMonth)
                .usageTotal(usageTotal)
                .build();
    }

    private User requireCaller() {
        String username = userService.getCurrentUsername();
        if (username == null || username.isBlank() || "anonymousUser".equalsIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return userService
                .findByUsernameIgnoreCase(username)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user"));
    }
}
