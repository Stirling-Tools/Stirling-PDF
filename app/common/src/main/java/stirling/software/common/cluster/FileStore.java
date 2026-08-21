package stirling.software.common.cluster;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/** Low-level storage seam for result/job files. */
public interface FileStore {

    /** Stored file record. */
    record Stored(String fileId, long size) {}

    /**
     * Store the given stream and return a generated file id and total bytes written. {@code owner}
     * may be null to indicate the file has no associated user (anonymous / desktop / async job with
     * no propagated security context); a non-null value is persisted alongside the data so {@link
     * #getOwner(String)} can return it later for authorization checks.
     */
    Stored store(InputStream in, String originalName, String owner) throws IOException;

    /** Store with no owner. Equivalent to {@link #store(InputStream, String, String)} with null. */
    default Stored store(InputStream in, String originalName) throws IOException {
        return store(in, originalName, null);
    }

    /**
     * Store the file at {@code source} and return a generated file id and total bytes written.
     *
     * <p>Default implementation opens {@code source} as a stream and delegates to {@link
     * #store(InputStream, String, String)}. Local-disk implementations should override to use a
     * direct file-to-file copy ({@code Files.copy(source, dest)} can use {@code sendfile(2)} on
     * Linux), which avoids the two-memory-copy hit of streaming a disk-backed upload through the
     * JVM heap.
     */
    default Stored store(Path source, String originalName, String owner) throws IOException {
        try (InputStream in = Files.newInputStream(source)) {
            return store(in, originalName, owner);
        }
    }

    /** Store with no owner. Equivalent to {@link #store(Path, String, String)} with null. */
    default Stored store(Path source, String originalName) throws IOException {
        return store(source, originalName, null);
    }

    /** Open the stored file for streaming reads. Caller closes. */
    InputStream retrieve(String fileId) throws IOException;

    /** Load the stored file into a byte array. */
    byte[] retrieveBytes(String fileId) throws IOException;

    /** Size of the stored file in bytes. */
    long size(String fileId) throws IOException;

    /** Delete the stored file. Returns true if a file was removed. */
    boolean delete(String fileId);

    /** Whether the file id exists in the store. */
    boolean exists(String fileId);

    /**
     * Returns the owner identifier recorded at store time, or {@code null} if the file does not
     * exist or was stored without an owner. Implementations must not throw when the file is missing
     * or when the owner record is absent; they should return null so callers can treat "no owner"
     * as a non-authoritative case.
     */
    String getOwner(String fileId) throws IOException;
}
