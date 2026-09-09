package stirling.software.proprietary.policy.ledger;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;

import stirling.software.proprietary.billing.ContentHasher;

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
        return ContentHasher.sha256(file);
    }
}
