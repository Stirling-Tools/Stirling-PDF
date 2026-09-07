package stirling.software.proprietary.security.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HexFormat;

/** Generates opaque API-key secrets and hashes them for storage/lookup. */
public final class ApiKeyHasher {

    /** Human-recognisable prefix so a leaked string is identifiable as a Stirling API key. */
    public static final String KEY_PREFIX = "sk_";

    /** Chars of the raw key kept for non-secret display (includes the {@code sk_} prefix). */
    private static final int DISPLAY_PREFIX_LENGTH = 11;

    private static final SecureRandom RANDOM = new SecureRandom();

    private ApiKeyHasher() {}

    /** A fresh opaque secret: {@code sk_} followed by 40 hex chars of cryptographic randomness. */
    public static String generateRawKey() {
        byte[] bytes = new byte[20];
        RANDOM.nextBytes(bytes);
        return KEY_PREFIX + HexFormat.of().formatHex(bytes);
    }

    /** SHA-256 hex of a raw key; the value stored and looked up, never the raw key. */
    public static String hash(String rawKey) {
        try {
            byte[] digest =
                    MessageDigest.getInstance("SHA-256")
                            .digest(rawKey.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Leading, non-secret fragment shown in listings (e.g. {@code sk_a1b2c3d4}). */
    public static String displayPrefix(String rawKey) {
        if (rawKey == null) {
            return "";
        }
        return rawKey.length() <= DISPLAY_PREFIX_LENGTH
                ? rawKey
                : rawKey.substring(0, DISPLAY_PREFIX_LENGTH);
    }
}
