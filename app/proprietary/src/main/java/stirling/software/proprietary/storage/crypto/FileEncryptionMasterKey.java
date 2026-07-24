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

    /** Bumped when master rotation ships (P2); recorded on every wrapped KEK row. */
    public static final int CURRENT_VERSION = 1;

    private final SecretKey key;

    public FileEncryptionMasterKey(String configuredKey, boolean clusterEnabled) {
        this.key = resolveKey(configuredKey, clusterEnabled);
        log.info(
                "Storage encryption master key initialised (AES-256-GCM, fingerprint {})",
                fingerprint());
    }

    private static SecretKey resolveKey(String configuredKey, boolean clusterEnabled) {
        String configured = configuredKey;
        if (configured == null || configured.isBlank()) {
            configured = System.getenv("STIRLING_FILE_ENCRYPTION_KEY");
        }
        if (configured != null && !configured.isBlank()) {
            return new SecretKeySpec(Base64.getDecoder().decode(configured.trim()), ALGORITHM);
        }
        if (clusterEnabled) {
            throw new IllegalStateException(
                    "cluster.enabled=true requires a shared file encryption key. Set"
                            + " STIRLING_FILE_ENCRYPTION_KEY (or"
                            + " stirling.security.fileEncryptionKey) to the same value on every"
                            + " node.");
        }
        return loadOrCreateKeyFile();
    }

    private static SecretKey loadOrCreateKeyFile() {
        Path path = Path.of(InstallationPathConfig.getConfigPath(), KEY_FILE);
        try {
            if (Files.exists(path)) {
                String encoded = Files.readString(path).trim();
                return new SecretKeySpec(Base64.getDecoder().decode(encoded), ALGORITHM);
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
        byte[] iv = Arrays.copyOfRange(wrapped, 0, IV_BYTES);
        byte[] ciphertext = Arrays.copyOfRange(wrapped, IV_BYTES, wrapped.length);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
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
