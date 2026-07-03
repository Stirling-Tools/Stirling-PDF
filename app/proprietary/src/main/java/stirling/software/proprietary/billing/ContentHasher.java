package stirling.software.proprietary.billing;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * SHA-256 content fingerprint shared by the SaaS charge path and the linked self-hosted instance's
 * meter (combined-billing "Mode A"), so both derive an <em>identical</em> signature for the same
 * bytes — the basis for lineage dedup. Pure, no Spring: fixed 64 KiB buffer (allocation independent
 * of file size), hardware-accelerated by the JVM where available.
 *
 * <p>Lives in {@code :proprietary} (not {@code :common}) so it stays out of the community core
 * build yet is reachable from {@code :saas} (which depends on {@code :proprietary}).
 */
public final class ContentHasher {

    private static final String ALGORITHM = "SHA-256";
    private static final int BUFFER_SIZE = 64 * 1024;

    private ContentHasher() {}

    /** Lower-case hex SHA-256 of the file's bytes. */
    public static String sha256(Path file) throws IOException {
        MessageDigest digest = newDigest();
        try (InputStream raw = Files.newInputStream(file);
                DigestInputStream in = new DigestInputStream(raw, digest)) {
            byte[] buf = new byte[BUFFER_SIZE];
            while (in.read(buf) != -1) {
                // drain through the digest; we only want the side effect
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /** Lower-case hex SHA-256 of the given bytes (e.g. to combine per-file hashes into one key). */
    public static String sha256(byte[] bytes) {
        return HexFormat.of().formatHex(newDigest().digest(bytes));
    }

    /**
     * A fresh SHA-256 digest, for callers that stream bytes through a {@link
     * java.security.DigestOutputStream} to hash in the same pass that writes the file — avoiding a
     * second full read just to fingerprint it. Pair with {@link #toHex(byte[])}.
     */
    public static MessageDigest newSha256() {
        return newDigest();
    }

    /** Lower-case hex of a completed digest — the same format {@link #sha256(Path)} produces. */
    public static String toHex(byte[] digest) {
        return HexFormat.of().formatHex(digest);
    }

    private static MessageDigest newDigest() {
        try {
            return MessageDigest.getInstance(ALGORITHM);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by every JDK; unreachable in practice.
            throw new IllegalStateException(ALGORITHM + " unavailable — JDK is misconfigured", e);
        }
    }
}
