package stirling.software.proprietary.integration.crypto;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * AES-256-GCM for stored credentials. Key from property, env var, or an auto-generated key file.
 */
@Component
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

    public CredentialEncryption(
            @Value("${stirling.security.credentialEncryptionKey:}") String configuredKey) {
        this.configuredKey = configuredKey;
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
            Files.writeString(path, Base64.getEncoder().encodeToString(generated.getEncoded()));
            log.warn(
                    "Generated a new credential encryption key at {}. Back this file up: losing it"
                            + " makes stored integration secrets unrecoverable.",
                    path);
            return generated;
        } catch (Exception e) {
            throw new IllegalStateException("Unable to initialise credential encryption key", e);
        }
    }

    public static String encrypt(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, requireKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt credential", e);
        }
    }

    public static String decrypt(String stored) {
        if (stored == null) {
            return null;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(stored);
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(combined, IV_BYTES, combined.length);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, requireKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt credential", e);
        }
    }

    private static SecretKey requireKey() {
        SecretKey current = key;
        if (current == null) {
            throw new IllegalStateException("Credential encryption not initialised");
        }
        return current;
    }

    /** For tests. */
    static void initialiseForTesting(SecretKey testKey) {
        key = testKey;
    }
}
