package stirling.software.proprietary.storage.crypto;

import java.time.Duration;
import java.util.function.Supplier;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;

/**
 * Holds the storage-encryption machinery for the always-installed {@link EncryptingStorageProvider}
 * decorator.
 *
 * <p>The decorator is unconditional so a node whose config lags the cluster (flag off, rolling
 * deploy, config drift) can never stream raw ciphertext: it always sniffs the header and decrypts
 * or fails loudly. The expensive parts — resolving the master key (which may generate a key file)
 * and the key service — are created lazily: eagerly at startup only when the write flag is on or
 * key rows already exist (preserving the fail-fast master-key verification), otherwise on first
 * encounter with an encrypted blob.
 */
@Slf4j
public class StorageEncryptionState {

    private static final Duration KEYS_EXIST_CACHE_TTL = Duration.ofSeconds(60);

    private final boolean writeEnabled;
    private final Supplier<FileEncryptionKeyService> keyServiceFactory;
    private final FileEncryptionKeyRepository keyRepository;

    private volatile FileEncryptionKeyService keyService;
    private volatile boolean keysExistEverChecked;
    private volatile long keysExistCheckedAtNanos;
    private volatile boolean keysExistCached;

    public StorageEncryptionState(
            boolean writeEnabled,
            Supplier<FileEncryptionKeyService> keyServiceFactory,
            FileEncryptionKeyRepository keyRepository) {
        this.writeEnabled = writeEnabled;
        this.keyServiceFactory = keyServiceFactory;
        this.keyRepository = keyRepository;
    }

    /** Test convenience: a pre-materialised state around an existing service. */
    public static StorageEncryptionState of(
            boolean writeEnabled, FileEncryptionKeyService keyService) {
        StorageEncryptionState state =
                new StorageEncryptionState(writeEnabled, () -> keyService, null);
        state.keyService = keyService;
        return state;
    }

    /** True when new writes are encrypted (flag on + licence passed). */
    public boolean isWriteEnabled() {
        return writeEnabled;
    }

    /**
     * The key service, created on first use. A failure here (no key material, wrong key) is a loud,
     * actionable error — never silently-served ciphertext.
     */
    public FileEncryptionKeyService keyService() throws StorageEncryptionException {
        FileEncryptionKeyService current = keyService;
        if (current != null) {
            return current;
        }
        synchronized (this) {
            if (keyService == null) {
                try {
                    keyService = keyServiceFactory.get();
                } catch (RuntimeException e) {
                    throw new StorageEncryptionException(
                            "Encrypted content was encountered but the storage encryption key"
                                    + " machinery could not be initialised: "
                                    + e.getMessage(),
                            e);
                }
            }
            return keyService;
        }
    }

    /** Forces eager initialisation (startup fail-fast path). */
    public void initialiseEagerly() {
        keyService = keyServiceFactory.get();
    }

    /**
     * Whether presigned/direct download URLs must be suppressed: any time this node encrypts new
     * writes or encrypted content may exist, a presigned URL could hand ciphertext to the client.
     * The registry check is cached briefly, so installs that never enable encryption keep the S3
     * fast path. Per-file precision (redirecting plaintext blobs via {@code
     * StoredFile.encryptionKeyId}) is a deliberate follow-up.
     */
    public boolean suppressDirectDownloads() {
        if (writeEnabled || keyService != null) {
            return true;
        }
        if (keyRepository == null) {
            return false;
        }
        long now = System.nanoTime();
        if (keysExistEverChecked
                && now - keysExistCheckedAtNanos < KEYS_EXIST_CACHE_TTL.toNanos()) {
            return keysExistCached;
        }
        keysExistCached = keyRepository.count() > 0;
        keysExistCheckedAtNanos = now;
        keysExistEverChecked = true;
        return keysExistCached;
    }
}
