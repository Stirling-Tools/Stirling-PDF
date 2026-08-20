package stirling.software.proprietary.storage.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import io.quarkus.narayana.jta.QuarkusTransaction;

import jakarta.persistence.PersistenceException;

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
    private final StorageEncryptionAuditListener auditListener;

    /**
     * Runs key-row creation in its own committed transaction (REQUIRES_NEW in production). Callers
     * like WorkflowSessionService are {@code @Transactional}, and with an assigned-UUID id the
     * INSERT would otherwise defer to the outer commit — the duplicate-key exception would surface
     * far from {@link #createActive}'s recovery catch, and the outer transaction would already be
     * rollback-only.
     *
     * <p>Migrated from Spring's {@code TransactionOperations}: production passes {@link
     * #requiringNewTransaction()}, tests pass a plain pass-through.
     */
    public interface KeyCreationTx {
        <T> T execute(Supplier<T> work);
    }

    /** Quarkus REQUIRES_NEW: the key row commits independently of any caller transaction. */
    public static KeyCreationTx requiringNewTransaction() {
        return new KeyCreationTx() {
            @Override
            public <T> T execute(Supplier<T> work) {
                return QuarkusTransaction.requiringNew().call(work::get);
            }
        };
    }

    /** No transaction management: the work runs on whatever context the caller is already in. */
    public static KeyCreationTx withoutTransaction() {
        return new KeyCreationTx() {
            @Override
            public <T> T execute(Supplier<T> work) {
                return work.get();
            }
        };
    }

    private final KeyCreationTx keyCreationTx;

    private final Cache<UUID, byte[]> unwrapCache =
            Caffeine.newBuilder().expireAfterWrite(CACHE_TTL).maximumSize(10_000).build();
    private final Cache<String, UUID> activeScopeCache =
            Caffeine.newBuilder().expireAfterWrite(CACHE_TTL).maximumSize(10_000).build();

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository, FileEncryptionMasterKey masterKey) {
        this(repository, masterKey, StorageEncryptionAuditListener.NOOP, withoutTransaction());
    }

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository,
            FileEncryptionMasterKey masterKey,
            StorageEncryptionAuditListener auditListener) {
        this(repository, masterKey, auditListener, withoutTransaction());
    }

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository,
            FileEncryptionMasterKey masterKey,
            KeyCreationTx keyCreationTx) {
        this(repository, masterKey, StorageEncryptionAuditListener.NOOP, keyCreationTx);
    }

    public FileEncryptionKeyService(
            FileEncryptionKeyRepository repository,
            FileEncryptionMasterKey masterKey,
            StorageEncryptionAuditListener auditListener,
            KeyCreationTx keyCreationTx) {
        this.repository = repository;
        this.masterKey = masterKey;
        this.auditListener = auditListener;
        this.keyCreationTx = keyCreationTx;
    }

    public FileEncryptionMasterKey masterKey() {
        return masterKey;
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
                        .findByIdOptional(keyId)
                        .orElseThrow(
                                () -> {
                                    auditListener.decryptDenied(keyId, "key not found");
                                    return new StorageEncryptionException(
                                            "No encryption key "
                                                    + keyId
                                                    + " — the key registry does not match the"
                                                    + " stored data (restored from an older"
                                                    + " database backup?)");
                                });
        if (row.getStatus() == FileEncryptionKey.Status.DISABLED) {
            auditListener.decryptDenied(keyId, "key disabled");
            throw new StorageKeyRevokedException(
                    "Encryption key " + keyId + " is disabled; access to this content is revoked");
        }
        return unwrapRow(row);
    }

    /**
     * Flips a key's status (the kill switch) and invalidates the local caches so the change is
     * immediate on this node; other cluster nodes converge within the cache TTL.
     */
    public FileEncryptionKey setKeyStatus(UUID keyId, FileEncryptionKey.Status status, String actor)
            throws StorageEncryptionException {
        FileEncryptionKey row =
                repository
                        .findByIdOptional(keyId)
                        .orElseThrow(
                                () -> new StorageEncryptionException("No encryption key " + keyId));
        row.setStatus(status);
        row.setStatusChangedAt(LocalDateTime.now());
        row.setStatusChangedBy(actor);
        FileEncryptionKey saved = repository.save(row);
        invalidate(keyId);
        return saved;
    }

    /**
     * Reverses the kill switch. Returns the key to ACTIVE only while its scope has no other ACTIVE
     * key, otherwise to RETIRED — which unwraps existing content just the same, and keeps exactly
     * one key wrapping new writes per scope.
     *
     * <p>The second case is reached whenever the scope uploaded anything while revoked: those
     * writes minted a fresh ACTIVE key, since revoking a key blocks reads of existing content
     * rather than stopping the scope from storing new files.
     */
    public FileEncryptionKey enable(UUID keyId, String actor) throws StorageEncryptionException {
        FileEncryptionKey row =
                repository
                        .findByIdOptional(keyId)
                        .orElseThrow(
                                () -> new StorageEncryptionException("No encryption key " + keyId));
        boolean scopeHasAnotherActiveKey =
                activeForScope(row.getScopeType(), row.getScopeId())
                        .filter(other -> !other.getKeyId().equals(keyId))
                        .isPresent();
        FileEncryptionKey.Status target =
                scopeHasAnotherActiveKey
                        ? FileEncryptionKey.Status.RETIRED
                        : FileEncryptionKey.Status.ACTIVE;
        if (scopeHasAnotherActiveKey) {
            log.info(
                    "Enabling key {} as RETIRED: {}:{} already has an active key wrapping new"
                            + " writes. Existing content under {} is readable again.",
                    keyId,
                    row.getScopeType(),
                    row.getScopeId(),
                    keyId);
        }
        return setKeyStatus(keyId, target, actor);
    }

    /**
     * Drops cached material for a key so status changes take effect without waiting out the TTL.
     */
    public void invalidate(UUID keyId) {
        unwrapCache.invalidate(keyId);
        activeScopeCache.asMap().values().removeIf(keyId::equals);
    }

    /**
     * Re-wraps every KEK row below the configured master-key version under the primary master key.
     * Cheap by design: touches only this small table, never file contents. Returns the number of
     * rows re-wrapped.
     */
    public int rotateMasterKey() throws StorageEncryptionException {
        int rewrapped = 0;
        for (FileEncryptionKey row :
                repository.findByMasterKeyVersionLessThan(masterKey.currentVersion())) {
            byte[] kek = unwrapRow(row);
            row.setWrappedKey(
                    Base64.getEncoder()
                            .encodeToString(masterKey.wrap(kek, aadFor(row.getKeyId()))));
            row.setMasterKeyVersion(masterKey.currentVersion());
            repository.save(row);
            invalidate(row.getKeyId());
            rewrapped++;
        }
        return rewrapped;
    }

    /**
     * Startup self-check: proves the configured master key can unwrap <em>every</em> KEK row, so a
     * wrong or half-rotated key fails fast instead of silently writing new files under a second key
     * hierarchy — or leaving some scopes' files unreadable while the rest of the app looks healthy.
     * Checking all rows rather than a sample matters because rotation can stop part-way; the table
     * holds one row per scope per rotation, so this stays cheap.
     */
    public void verifyMasterKey() {
        long pending = repository.countByMasterKeyVersionLessThan(masterKey.currentVersion());
        if (pending > 0) {
            log.warn(
                    "{} encryption key row(s) are still wrapped by the previous master key. Run"
                            + " POST /api/v1/admin/storage-encryption/master/rotate, then remove"
                            + " stirling.security.fileEncryptionKeyPrevious.",
                    pending);
        }
        long stranded = repository.countByMasterKeyVersionGreaterThan(masterKey.currentVersion());
        if (stranded > 0) {
            log.warn(
                    "{} encryption key row(s) are wrapped by a master-key version newer than the"
                            + " configured stirling.security.fileEncryptionKeyVersion={}. Rotation"
                            + " only re-wraps rows below the configured version, so these rows can"
                            + " never be re-wrapped while it stays this low.",
                    stranded,
                    masterKey.currentVersion());
        }
        List<FileEncryptionKey> unreadable = new ArrayList<>();
        StorageEncryptionException firstFailure = null;
        // DISABLED rows are included: revocation is meant to be reversible, and a row that cannot
        // be unwrapped would not come back on enable.
        for (FileEncryptionKey row : repository.listAll()) {
            try {
                unwrapRow(row);
            } catch (StorageEncryptionException e) {
                unreadable.add(row);
                if (firstFailure == null) {
                    firstFailure = e;
                }
            }
        }
        if (!unreadable.isEmpty()) {
            throw new IllegalStateException(
                    "The configured file encryption key (fingerprint "
                            + masterKey.fingerprint()
                            + ") cannot unwrap "
                            + unreadable.size()
                            + " of "
                            + repository.count()
                            + " encryption key row(s), starting with "
                            + unreadable.get(0).getKeyId()
                            + " ("
                            + unreadable.get(0).getScopeType()
                            + ":"
                            + unreadable.get(0).getScopeId()
                            + ", master key version "
                            + unreadable.get(0).getMasterKeyVersion()
                            + "). Files under those keys would be unreadable. Refusing to start —"
                            + " restore the original key as"
                            + " stirling.security.fileEncryptionKeyPrevious (or as"
                            + " STIRLING_FILE_ENCRYPTION_KEY) and re-run the rotation.",
                    firstFailure);
        }
    }

    private FileEncryptionKey findOrCreateActive(
            FileEncryptionKey.ScopeType scopeType, long scopeId) throws StorageEncryptionException {
        return activeForScope(scopeType, scopeId).orElseGet(() -> createActive(scopeType, scopeId));
    }

    private Optional<FileEncryptionKey> activeForScope(
            FileEncryptionKey.ScopeType scopeType, long scopeId) {
        return repository.findFirstByScopeTypeAndScopeIdAndStatusOrderByKeyVersionDesc(
                scopeType, scopeId, FileEncryptionKey.Status.ACTIVE);
    }

    // Package-private so the @DataJpaTest can drive duplicate-insert recovery deterministically.
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
        row.setMasterKeyVersion(masterKey.currentVersion());
        row.setStatus(FileEncryptionKey.Status.ACTIVE);
        try {
            // saveAndFlush inside a fresh transaction so a unique-constraint violation surfaces
            // right here (not at some outer commit) and the caller's transaction stays healthy.
            FileEncryptionKey saved = keyCreationTx.execute(() -> repository.saveAndFlush(row));
            log.info(
                    "Created storage encryption key {} for {}:{}",
                    saved.getKeyId(),
                    scopeType,
                    scopeId);
            unwrapCache.put(saved.getKeyId(), kek);
            auditListener.keyCreated(saved.getKeyId(), scopeType + ":" + scopeId, version);
            return saved;
        } catch (PersistenceException raced) {
            // Another node created the scope key concurrently; use theirs.
            return activeForScope(scopeType, scopeId).orElseThrow(() -> raced);
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
