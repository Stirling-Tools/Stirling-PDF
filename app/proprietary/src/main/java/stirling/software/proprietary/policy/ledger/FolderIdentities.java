package stirling.software.proprietary.policy.ledger;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * The folder backend's identity and version scheme, shared by {@code FolderInputSource} and {@code
 * FolderOutputSink} so outputs are recorded under exactly the identity the next scan derives.
 * Directories are canonicalised with {@code toRealPath()} so symlinked aliases agree.
 */
public final class FolderIdentities {

    private FolderIdentities() {}

    /** Canonical form of a configured directory; resolves symlinks, so the dir must exist. */
    public static Path canonicalDir(Path dir) throws IOException {
        return dir.toRealPath();
    }

    /** Identity of {@code file} under {@code dir}: its path re-rooted onto the canonical dir. */
    public static String identity(Path canonicalDir, Path dir, Path file) {
        return canonicalDir.resolve(dir.relativize(file)).normalize().toString();
    }

    /** The cheap version gate: a change to content length or mtime means "look closer". */
    public static String statGate(Path file) throws IOException {
        BasicFileAttributes attributes = Files.readAttributes(file, BasicFileAttributes.class);
        return attributes.size() + ":" + attributes.lastModifiedTime().toMillis();
    }

    /**
     * The strong version token: distinguishes a real change from a touch, at the cost of a read.
     */
    public static String contentHash(Path file) throws IOException {
        MessageDigest digest = sha256();
        try (var in = Files.newInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /** Fixed-width key form of an identity, so any identity length fits the ledger's index. */
    public static String identityHash(String identity) {
        return HexFormat.of().formatHex(sha256().digest(identity.getBytes(StandardCharsets.UTF_8)));
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
