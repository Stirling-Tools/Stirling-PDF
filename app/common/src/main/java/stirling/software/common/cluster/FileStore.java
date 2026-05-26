package stirling.software.common.cluster;

import java.io.IOException;
import java.io.InputStream;

/** Low-level storage seam for result/job files. */
public interface FileStore {

    /** Stored file record. */
    record Stored(String fileId, long size) {}

    /** Store the given stream and return a generated file id and total bytes written. */
    Stored store(InputStream in, String originalName) throws IOException;

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
