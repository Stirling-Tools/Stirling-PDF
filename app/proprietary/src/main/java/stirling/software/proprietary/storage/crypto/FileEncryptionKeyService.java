package stirling.software.proprietary.storage.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionOperations;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileEncryptionKey;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;

/**
 * Resolves and unwraps scope-level KEKs for storage encryption. Per-team scoping by default (files
 * keep decrypting after team changes because each blob header pins its exact key id); GLOBAL is the
 * fallback for owners without a team; SOURCE is reserved for pipeline encryption (P2).
 *
 * <p>Unwrapped KEKs are cached briefly so the kill switch (DISABLED status) propagates across
 * cluster nodes within {@link #CACHE_TTL} without a per-read DB round-trip. Note the TTL bounds the
 * write side too: a key disabled on another node can wrap new blobs for up to the TTL there.
 */
@Slf4j
public class FileEncryptionKeyService {

    private static final Duration CACHE_TTL = Duration.ofSeconds(60);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final FileEncryptionKeyRepository repository;
    private final FileEncryptionMasterKey masterKey;

    /**
     * Runs key-row creation in its own committed transaction (REQUIRES_NEW in production). Callers
     * like WorkflowSessionService are {@code @Transactional}, and with an assigned-UUID id the
     * INSERT would otherwise defer to the outer commit — the duplicate-key exception would surface
     * far from {@link #createActive}'s recovery catch, and the outer transaction would already be
     * rollback-only.
     */
    private final TransactionOperations keyCreationTx;

    private final Cache<UUID, byte[]> unwrapCache =
            Caffeine.newBuilder().expireAfterWrite(CACHE_TTL).maximumSize(10_000).build();
    private final Cache<String, UUID> activeScopeCache =
            Caffeine.newBuilder().expireAfterWrite(CACHE_TTL).maximumSize(10_000).build();

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository, FileEncryptionMasterKey masterKey) {
        this(repository, masterKey, TransactionOperations.withoutTransaction());
    }

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository,
            FileEncryptionMasterKey masterKey,
            TransactionOperations keyCreationTx) {
        this.repository = repository;
        this.masterKey = masterKey;
        this.keyCreationTx = keyCreationTx;
    }

    public record ScopeKek(UUID keyId, byte[] key) {}

    /** The ACTIVE KEK for the owner's scope, created on first use. */
    public ScopeKek activeKekForOwner(User owner) throws StorageEncryptionException {
        FileEncryptionKey.ScopeType scopeType = FileEncryptionKey.ScopeType.GLOBAL;
        long scopeId = 0;
        Team team = owner != null ? owner.getTeam() : null;
        if (team != null && team.getId() != null) {
            scopeType = FileEncryptionKey.ScopeType.TEAM;
            scopeId = team.getId();
        }
        UUID cachedId = activeScopeCache.getIfPresent(scopeType + ":" + scopeId);
        if (cachedId != null) {
            byte[] cachedKey = unwrapCache.getIfPresent(cachedId);
            if (cachedKey != null) {
                return new ScopeKek(cachedId, cachedKey);
            }
        }
        FileEncryptionKey row = findOrCreateActive(scopeType, scopeId);
        byte[] kek = unwrapRow(row);
        activeScopeCache.put(scopeType + ":" + scopeId, row.getKeyId());
        return new ScopeKek(row.getKeyId(), kek);
    }

    /** Unwraps the KEK for decrypting an existing blob. Fails closed on DISABLED or missing. */
    public byte[] kekForDecrypt(UUID keyId) throws StorageEncryptionException {
        byte[] cached = unwrapCache.getIfPresent(keyId);
        if (cached != null) {
            return cached;
        }
        FileEncryptionKey row =
                repository
                        .findById(keyId)
                        .orElseThrow(
                                () ->
                                        new StorageEncryptionException(
                                                "No encryption key "
                                                        + keyId
                                                        + " — the key registry does not match the"
                                                        + " stored data (restored from an older"
                                                        + " database backup?)"));
        if (row.getStatus() == FileEncryptionKey.Status.DISABLED) {
            throw new StorageKeyRevokedException(
                    "Encryption key " + keyId + " is disabled; access to this content is revoked");
        }
        return unwrapRow(row);
    }

    /**
     * Startup self-check: proves the resolved master key can unwrap an existing row, so a wrong key
     * fails fast instead of silently writing new files under a second key hierarchy.
     */
    public void verifyMasterKey() {
        repository
                .findFirstByStatus(FileEncryptionKey.Status.ACTIVE)
                .or(() -> repository.findFirstByStatus(FileEncryptionKey.Status.RETIRED))
                .ifPresent(
                        row -> {
                            try {
                                unwrapRow(row);
                            } catch (StorageEncryptionException e) {
                                throw new IllegalStateException(
                                        "The configured file encryption key (fingerprint "
                                                + masterKey.fingerprint()
                                                + ") cannot unwrap existing key "
                                                + row.getKeyId()
                                                + ". Refusing to start with a mismatched key —"
                                                + " restore the original"
                                                + " STIRLING_FILE_ENCRYPTION_KEY /"
                                                + " file-encryption.key.",
                                        e);
                            }
                        });
    }

    private FileEncryptionKey findOrCreateActive(
            FileEncryptionKey.ScopeType scopeType, long scopeId) throws StorageEncryptionException {
        return repository
                .findFirstByScopeTypeAndScopeIdAndStatus(
                        scopeType, scopeId, FileEncryptionKey.Status.ACTIVE)
                .orElseGet(() -> createActive(scopeType, scopeId));
    }

    // Package-private so the @DataJpaTest can drive the duplicate-insert recovery
    // deterministically.
    FileEncryptionKey createActive(FileEncryptionKey.ScopeType scopeType, long scopeId) {
        byte[] kek = new byte[EncryptedFileFormat.DEK_LENGTH_BYTES];
        RANDOM.nextBytes(kek);
        FileEncryptionKey row = new FileEncryptionKey();
        row.setKeyId(UUID.randomUUID());
        row.setScopeType(scopeType);
        row.setScopeId(scopeId);
        int version =
                repository
                                .findFirstByScopeTypeAndScopeIdOrderByKeyVersionDesc(
                                        scopeType, scopeId)
                                .map(FileEncryptionKey::getKeyVersion)
                                .orElse(0)
                        + 1;
        row.setKeyVersion(version);
        row.setWrappedKey(
                Base64.getEncoder().encodeToString(masterKey.wrap(kek, aadFor(row.getKeyId()))));
        row.setMasterKeyVersion(FileEncryptionMasterKey.CURRENT_VERSION);
        row.setStatus(FileEncryptionKey.Status.ACTIVE);
        try {
            // saveAndFlush inside a fresh transaction so a unique-constraint violation surfaces
            // right here (not at some outer commit) and the caller's transaction stays healthy.
            FileEncryptionKey saved = keyCreationTx.execute(status -> repository.saveAndFlush(row));
            log.info(
                    "Created storage encryption key {} for {}:{}",
                    saved.getKeyId(),
                    scopeType,
                    scopeId);
            unwrapCache.put(saved.getKeyId(), kek);
            return saved;
        } catch (DataIntegrityViolationException raced) {
            // Another node created the scope key concurrently; use theirs.
            return repository
                    .findFirstByScopeTypeAndScopeIdAndStatus(
                            scopeType, scopeId, FileEncryptionKey.Status.ACTIVE)
                    .orElseThrow(() -> raced);
        }
    }

    private byte[] unwrapRow(FileEncryptionKey row) throws StorageEncryptionException {
        try {
            byte[] kek =
                    masterKey.unwrap(
                            Base64.getDecoder().decode(row.getWrappedKey()),
                            aadFor(row.getKeyId()));
            unwrapCache.put(row.getKeyId(), kek);
            return kek;
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException(
                    "Failed to unwrap encryption key "
                            + row.getKeyId()
                            + " — master key mismatch or corrupted key row",
                    e);
        }
    }

    // Binds each wrapped KEK to its row identity so ciphertexts can't be swapped between rows.
    private static byte[] aadFor(UUID keyId) {
        return keyId.toString().getBytes(StandardCharsets.US_ASCII);
    }
}
