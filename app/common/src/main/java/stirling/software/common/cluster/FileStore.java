package stirling.software.common.cluster;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/** Low-level storage seam for result/job files. */
public interface FileStore {

    /** Stored file record. */
    record Stored(String fileId, long size) {}

    /** Store the given stream and return a generated file id and total bytes written. */
    Stored store(InputStream in, String originalName) throws IOException;

    /**
     * Store the file at {@code source} and return a generated file id and total bytes written.
     *
     * <p>Default implementation opens {@code source} as a stream and delegates to {@link
     * #store(InputStream, String)}. Local-disk implementations should override to use a direct
     * file-to-file copy ({@code Files.copy(source, dest)} can use {@code sendfile(2)} on Linux),
     * which avoids the two-memory-copy hit of streaming a disk-backed upload through the JVM heap.
     */
    default Stored store(Path source, String originalName) throws IOException {
        try (InputStream in = Files.newInputStream(source)) {
            return store(in, originalName);
        }
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
}
