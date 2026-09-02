package stirling.software.proprietary.integration.crypto;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.EnumSet;
import java.util.Optional;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.arc.Arc;
import io.quarkus.runtime.Startup;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * AES-256-GCM for stored credentials. Key from property, env var, or an auto-generated key file.
 */
// @Startup, because nothing injects this bean - it is reached through its static encrypt/decrypt
// from a JPA AttributeConverter, so Arc would otherwise remove it as unused and never run init().
@Startup
@ApplicationScoped
@Slf4j
public class CredentialEncryption {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final String KEY_FILE = "credential-encryption.key";
    private static final SecureRandom RANDOM = new SecureRandom();

    private static volatile SecretKey key;

    private final String configuredKey;
    private final boolean clusterEnabled;

    public CredentialEncryption(
            // Optional, not defaultValue="": SmallRye Config reads an empty default as absent and
            // then fails to convert it to String.
            @ConfigProperty(name = "stirling.security.credentialEncryptionKey")
                    Optional<String> configuredKey,
            @ConfigProperty(name = "cluster.enabled", defaultValue = "false")
                    boolean clusterEnabled) {
        this.configuredKey = configuredKey.orElse("");
        this.clusterEnabled = clusterEnabled;
    }

    @PostConstruct
    void init() {
        key = resolveKey();
        log.info("Credential encryption initialised (AES-256-GCM)");
    }

    private SecretKey resolveKey() {
        String configured = configuredKey;
        if (configured == null || configured.isBlank()) {
            configured = System.getenv("STIRLING_CREDENTIAL_ENCRYPTION_KEY");
        }
        if (configured != null && !configured.isBlank()) {
            return new SecretKeySpec(Base64.getDecoder().decode(configured.trim()), ALGORITHM);
        }
        // Cluster nodes must share this key, so fail fast rather than generate a node-local one.
        if (clusterEnabled) {
            throw new IllegalStateException(
                    "cluster.enabled=true requires a shared credential encryption key. Set"
                            + " STIRLING_CREDENTIAL_ENCRYPTION_KEY (or"
                            + " stirling.security.credentialEncryptionKey) to the same value on every"
                            + " node.");
        }
        return loadOrCreateKeyFile();
    }

    private SecretKey loadOrCreateKeyFile() {
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
                    "Generated a new credential encryption key at {}. Back this file up: losing it"
                            + " makes stored integration secrets and pipeline supporting files"
                            + " unrecoverable.",
                    path);
            return generated;
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialise credential encryption key", e);
        }
    }

    // The master key decrypts every stored integration secret, so create it 0600
    // (owner-only) atomically. On non-POSIX filesystems (Windows) the config-dir
    // ACL is the protection; we still create the file, just without POSIX perms.
    private static void writeOwnerOnly(Path path, String content) throws IOException {
        EnumSet<PosixFilePermission> ownerOnly =
                EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
        try {
            Files.createFile(path, PosixFilePermissions.asFileAttribute(ownerOnly));
        } catch (UnsupportedOperationException e) {
            Files.createFile(path);
        }
        Files.writeString(path, content);
        try {
            Files.setPosixFilePermissions(path, ownerOnly);
        } catch (UnsupportedOperationException ignored) {
            // Non-POSIX filesystem: nothing to tighten here.
        }
    }

    /** Raw {@code IV || ciphertext}, for binary columns that can't afford Base64's 33% overhead. */
    public static byte[] encryptBytes(byte[] plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, requireKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext);
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return combined;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt credential", e);
        }
    }

    /** Inverse of {@link #encryptBytes}; throws if the blob was tampered with (GCM tag). */
    public static byte[] decryptBytes(byte[] stored) {
        if (stored == null) {
            return null;
        }
        try {
            byte[] iv = Arrays.copyOfRange(stored, 0, IV_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(stored, IV_BYTES, stored.length);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, requireKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return cipher.doFinal(ciphertext);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt credential", e);
        }
    }

    public static String encrypt(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        return Base64.getEncoder()
                .encodeToString(encryptBytes(plaintext.getBytes(StandardCharsets.UTF_8)));
    }

    public static String decrypt(String stored) {
        if (stored == null) {
            return null;
        }
        // Base64's IllegalArgumentException stays uncaught: LegacyDecryptStringConverter needs it.
        return new String(decryptBytes(Base64.getDecoder().decode(stored)), StandardCharsets.UTF_8);
    }

    private static SecretKey requireKey() {
        SecretKey current = key;
        if (current == null && Arc.container() != null) {
            // A JPA AttributeConverter can encrypt during another bean's @PostConstruct, before
            // this one is first injected. Spring created singletons eagerly; Arc does not, and its
            // client proxy stays uninitialised until a method is called on it - hence activeKey().
            CredentialEncryption bean =
                    Arc.container().instance(CredentialEncryption.class).orElse(null);
            current = bean == null ? null : bean.activeKey();
        }
        if (current == null) {
            throw new IllegalStateException("Credential encryption not initialised");
        }
        return current;
    }

    /** Called through the CDI proxy purely to force {@link #init()} to have run. */
    SecretKey activeKey() {
        return key;
    }

    /** For tests. */
    static void initialiseForTesting(SecretKey testKey) {
        key = testKey;
    }
}
