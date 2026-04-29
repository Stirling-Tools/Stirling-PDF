package stirling.software.proprietary.workflow.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Provides AES-256-GCM encryption for sensitive fields stored in JSONB metadata columns (e.g.
 * keystore passwords). The encryption key is derived from the application's
 * AutomaticallyGenerated.key, which is persisted in settings on first run.
 *
 * <p>Encrypted values are prefixed with {@value #ENC_PREFIX} so that legacy plaintext values
 * written before this service was introduced can still be decrypted transparently.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MetadataEncryptionService {

    static final String ENC_PREFIX = "enc:";
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128; // bits

    private final ApplicationProperties applicationProperties;

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Encrypts {@code plaintext} with AES-256-GCM and returns a Base64-encoded ciphertext prefixed
     * with {@value #ENC_PREFIX}.
     */
    public String encrypt(String plaintext) {
        if (plaintext == null) {
            return null;
        }
        try {
            SecretKeySpec keySpec = deriveKey();
            byte[] iv = generateIv();

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            byte[] cipherBytes = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            // Prepend IV to ciphertext for storage: [12-byte IV][ciphertext+tag]
            byte[] combined = new byte[iv.length + cipherBytes.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherBytes, 0, combined, iv.length, cipherBytes.length);

            return ENC_PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt metadata field", e);
        }
    }

    /**
     * Decrypts a value produced by {@link #encrypt}. If the value does not start with {@value
     * #ENC_PREFIX} it is returned as-is to preserve backwards compatibility with plaintext values
     * written before this service existed.
     */
    public String decrypt(String value) {
        if (value == null) {
            return null;
        }
        if (!value.startsWith(ENC_PREFIX)) {
            // Legacy plaintext – return unchanged
            return value;
        }
        try {
            SecretKeySpec keySpec = deriveKey();
            byte[] combined = Base64.getDecoder().decode(value.substring(ENC_PREFIX.length()));

            byte[] iv = Arrays.copyOfRange(combined, 0, GCM_IV_LENGTH);
            byte[] cipherBytes = Arrays.copyOfRange(combined, GCM_IV_LENGTH, combined.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            return new String(cipher.doFinal(cipherBytes), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt metadata field", e);
        }
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private SecretKeySpec deriveKey() throws Exception {
        String rawKey = applicationProperties.getAutomaticallyGenerated().getKey();
        if (rawKey == null || rawKey.isBlank()) {
            throw new IllegalStateException(
                    "AutomaticallyGenerated.key is not initialised — cannot derive encryption key");
        }
        // SHA-256 of the raw key gives a stable 32-byte AES-256 key
        byte[] hash =
                MessageDigest.getInstance("SHA-256")
                        .digest(rawKey.getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(hash, "AES");
    }

    private static byte[] generateIv() {
        byte[] iv = new byte[GCM_IV_LENGTH];
        new SecureRandom().nextBytes(iv);
        return iv;
    }
}
