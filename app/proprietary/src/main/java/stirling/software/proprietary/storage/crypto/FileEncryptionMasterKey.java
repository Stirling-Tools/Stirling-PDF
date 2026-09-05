package stirling.software.proprietary.storage.crypto;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.EnumSet;
import java.util.HexFormat;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * Master key-encryption key for storage encryption at rest. Deliberately a separate key from {@code
 * credential-encryption.key}: file data and integration secrets have different blast radii and
 * rotate independently.
 *
 * <p>Resolution order mirrors {@code CredentialEncryption}: {@code
 * stirling.security.fileEncryptionKey} property, {@code STIRLING_FILE_ENCRYPTION_KEY} env var, then
 * an auto-generated owner-only {@code file-encryption.key} in the config dir. Cluster mode requires
 * an explicitly shared key.
 */
@Slf4j
public class FileEncryptionMasterKey {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final String KEY_FILE = "file-encryption.key";
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Default master-key version when rotation has never been configured. */
    public static final int CURRENT_VERSION = 1;

    private final SecretKey key;
    private final SecretKey previousKey;
    private final int currentVersion;
    private final Source source;

    /** Where the master key came from, so the UI can warn about an unbacked-up generated key. */
    public enum Source {
        CONFIG("config"),
        ENVIRONMENT("environment"),
        GENERATED("generated");

        private final String wireName;

        Source(String wireName) {
            this.wireName = wireName;
        }

        public String wireName() {
            return wireName;
        }
    }

    public FileEncryptionMasterKey(String configuredKey, boolean clusterEnabled) {
        this(configuredKey, null, CURRENT_VERSION, clusterEnabled);
    }

    /**
     * @param previousKeyBase64 optional outgoing master key kept only during rotation: {@link
     *     #unwrap} falls back to it so existing KEK rows stay readable until {@code rotate}
     *     re-wraps them under the primary key.
     * @param currentVersion admin-bumped version stamped on newly wrapped KEK rows ({@code
     *     stirling.security.fileEncryptionKeyVersion}); rotation re-wraps rows below it.
     */
    public FileEncryptionMasterKey(
            String configuredKey,
            String previousKeyBase64,
            int currentVersion,
            boolean clusterEnabled) {
        Resolved resolved = resolveKey(configuredKey, clusterEnabled);
        this.key = resolved.key();
        this.source = resolved.source();
        this.previousKey =
                previousKeyBase64 == null || previousKeyBase64.isBlank()
                        ? null
                        : decodeKey(
                                previousKeyBase64, "stirling.security.fileEncryptionKeyPrevious");
        if (currentVersion < 1) {
            log.warn(
                    "stirling.security.fileEncryptionKeyVersion={} is not a valid version; using 1",
                    currentVersion);
        }
        this.currentVersion = Math.max(1, currentVersion);
        log.info(
                "Storage encryption master key initialised (AES-256-GCM, fingerprint {}, version"
                        + " {}{})",
                fingerprint(),
                this.currentVersion,
                previousKey != null ? ", previous key configured for rotation" : "");
    }

    public int currentVersion() {
        return currentVersion;
    }

    public Source source() {
        return source;
    }

    public boolean hasPreviousKey() {
        return previousKey != null;
    }

    private record Resolved(SecretKey key, Source source) {}

    private static Resolved resolveKey(String configuredKey, boolean clusterEnabled) {
        String configured = configuredKey;
        String source = "stirling.security.fileEncryptionKey";
        Source provenance = Source.CONFIG;
        if (configured == null || configured.isBlank()) {
            configured = System.getenv("STIRLING_FILE_ENCRYPTION_KEY");
            source = "STIRLING_FILE_ENCRYPTION_KEY";
            provenance = Source.ENVIRONMENT;
        }
        if (configured != null && !configured.isBlank()) {
            return new Resolved(decodeKey(configured, source), provenance);
        }
        if (clusterEnabled) {
            throw new IllegalStateException(
                    "cluster.enabled=true requires a shared file encryption key. Set"
                            + " STIRLING_FILE_ENCRYPTION_KEY (or"
                            + " stirling.security.fileEncryptionKey) to the same value on every"
                            + " node.");
        }
        return new Resolved(loadOrCreateKeyFile(), Source.GENERATED);
    }

    /**
     * Decodes and validates key material: must be valid base64 for exactly 32 bytes. Without the
     * length check a short key would silently downgrade to AES-128/192 while the startup log claims
     * AES-256.
     */
    private static SecretKey decodeKey(String base64, String source) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(source + " is not valid base64", e);
        }
        if (bytes.length != 32) {
            throw new IllegalStateException(
                    source
                            + " must decode to exactly 32 bytes (a 256-bit AES key), got "
                            + bytes.length
                            + " bytes. Generate one with: openssl rand -base64 32");
        }
        return new SecretKeySpec(bytes, ALGORITHM);
    }

    private static SecretKey loadOrCreateKeyFile() {
        Path path = Path.of(InstallationPathConfig.getConfigPath(), KEY_FILE);
        try {
            if (Files.exists(path)) {
                return decodeKey(Files.readString(path), path.toString());
            }
            KeyGenerator generator = KeyGenerator.getInstance(ALGORITHM);
            generator.init(256);
            SecretKey generated = generator.generateKey();
            Files.createDirectories(path.getParent());
            writeOwnerOnly(path, Base64.getEncoder().encodeToString(generated.getEncoded()));
            log.warn(
                    "Generated a new file encryption key at {}. Back this file up: losing it makes"
                            + " every encrypted stored file unrecoverable.",
                    path);
            return generated;
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialise file encryption key", e);
        }
    }

    private static void writeOwnerOnly(Path path, String content) throws IOException {
        EnumSet<PosixFilePermission> ownerOnly =
                EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
        try {
            Files.createFile(path, PosixFilePermissions.asFileAttribute(ownerOnly));
        } catch (UnsupportedOperationException e) {
            // Non-POSIX filesystem (Windows): the config-dir ACL is the protection.
            Files.createFile(path);
        }
        Files.writeString(path, content);
        try {
            Files.setPosixFilePermissions(path, ownerOnly);
        } catch (UnsupportedOperationException ignored) {
        }
    }

    public byte[] wrap(byte[] kek, byte[] associatedData) {
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipher.updateAAD(associatedData);
            byte[] ciphertext = cipher.doFinal(kek);
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return combined;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to wrap scope key", e);
        }
    }

    public byte[] unwrap(byte[] wrapped, byte[] associatedData) throws GeneralSecurityException {
        try {
            return unwrapWith(key, wrapped, associatedData);
        } catch (GeneralSecurityException primaryFailure) {
            if (previousKey == null) {
                throw primaryFailure;
            }
            try {
                return unwrapWith(previousKey, wrapped, associatedData);
            } catch (GeneralSecurityException previousFailure) {
                // Report the primary key's failure, or a corrupt row gets diagnosed through the
                // outgoing key's error message.
                primaryFailure.addSuppressed(previousFailure);
                throw primaryFailure;
            }
        }
    }

    private static byte[] unwrapWith(SecretKey unwrapKey, byte[] wrapped, byte[] associatedData)
            throws GeneralSecurityException {
        byte[] iv = Arrays.copyOfRange(wrapped, 0, IV_BYTES);
        byte[] ciphertext = Arrays.copyOfRange(wrapped, IV_BYTES, wrapped.length);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, unwrapKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
        cipher.updateAAD(associatedData);
        return cipher.doFinal(ciphertext);
    }

    /** SHA-256 prefix of the key material so admins can verify backups without exposing it. */
    public String fingerprint() {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getEncoded());
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (GeneralSecurityException e) {
            return "unavailable";
        }
    }
}
