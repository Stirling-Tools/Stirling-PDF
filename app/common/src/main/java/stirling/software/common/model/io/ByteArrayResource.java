package stirling.software.common.model.io;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

/**
 * In-memory byte-backed {@link Resource} (migration shim for Spring's {@code ByteArrayResource}).
 *
 * <p>Unlike {@link InputStreamResource} this is re-readable: every {@link #getInputStream()} hands
 * back a fresh stream over the same bytes. Callers that hold one resource across several consumers
 * - a policy run passes its supporting files to every step - depend on that.
 */
public class ByteArrayResource implements Resource {

    private final byte[] byteArray;
    private final String filename;

    public ByteArrayResource(byte[] byteArray) {
        this(byteArray, null);
    }

    public ByteArrayResource(byte[] byteArray, String filename) {
        this.byteArray = byteArray == null ? new byte[0] : byteArray;
        this.filename = filename;
    }

    /** The backing bytes. Not defensively copied, matching Spring's contract. */
    public byte[] getByteArray() {
        return byteArray;
    }

    @Override
    public InputStream getInputStream() {
        return new ByteArrayInputStream(byteArray);
    }

    @Override
    public boolean exists() {
        return true;
    }

    @Override
    public String getFilename() {
        return filename;
    }

    @Override
    public long contentLength() {
        return byteArray.length;
    }

    @Override
    public File getFile() throws IOException {
        throw new IOException("ByteArrayResource is not backed by a file");
    }
}
