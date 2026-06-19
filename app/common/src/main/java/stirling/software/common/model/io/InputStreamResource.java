package stirling.software.common.model.io;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;

/**
 * Stream-backed {@link Resource} (migration shim for Spring's {@code InputStreamResource}). As with
 * Spring, the stream can only be read once.
 */
public class InputStreamResource implements Resource {

    private final InputStream inputStream;
    private final String filename;

    public InputStreamResource(InputStream inputStream) {
        this(inputStream, null);
    }

    public InputStreamResource(InputStream inputStream, String filename) {
        this.inputStream = inputStream;
        this.filename = filename;
    }

    @Override
    public InputStream getInputStream() {
        return inputStream;
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
    public long contentLength() throws IOException {
        // Spring's InputStreamResource also cannot report length without consuming the stream.
        return -1;
    }

    @Override
    public File getFile() throws IOException {
        throw new IOException("InputStreamResource is not backed by a file");
    }
}
